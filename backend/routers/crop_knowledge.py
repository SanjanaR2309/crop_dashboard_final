"""
Router: /api/stats, /api/crop-knowledge
Only touches: crop_stage_knowledge
"""
import os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from database import get_db
import queries
from gemini_service import regenerate_stage, generate_crop_stages_template, generate_env_conditions
import asyncio
from uuid import uuid4
from fastapi import HTTPException

router = APIRouter()

# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    return await queries.get_stats(db)

# ── List / Search ─────────────────────────────────────────────────────────────

@router.get("/crop-knowledge")
async def list_reports(
    page: int = 1,
    page_size: int = 10,
    search: str = "",
    crops: str = "",
    sources: str = "",
    db: AsyncSession = Depends(get_db),
):
    return await queries.list_reports(db, page=page, page_size=page_size, search=search, crops=crops, sources=sources)

# ── Single record ─────────────────────────────────────────────────────────────

@router.get("/crop-knowledge/{uid}")
async def get_report(uid: str, db: AsyncSession = Depends(get_db)):
    report = await queries.get_report_by_uid(db, uid)
    if not report:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Record not found")
    return report

# ── Save (accept revision) ────────────────────────────────────────────────────

class SavePayload(BaseModel):
    susceptible_pests:    Optional[str] = None
    pest_risk_factors:    Optional[str] = None
    pest_management:      Optional[str] = None
    susceptible_diseases: Optional[str] = None
    disease_risk_factors: Optional[str] = None
    disease_management:   Optional[str] = None

@router.put("/crop-knowledge/{uid}")
async def save_report(uid: str, payload: SavePayload, db: AsyncSession = Depends(get_db)):
    updated = await queries.upsert_report(db, uid, payload.model_dump())
    return updated

# ── Regenerate via Gemini ─────────────────────────────────────────────────────

@router.post("/crop-knowledge/{uid}/regenerate")
async def regenerate_report(uid: str, db: AsyncSession = Depends(get_db)):
    report = await queries.get_report_by_uid(db, uid)
    if not report:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Record not found")

    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    new_data = await regenerate_stage(
        crop_name=report["crop_name"],
        main_stage=report["main_stage"],
        sub_stage_name=report["sub_stage_name"],
        start_day=report["start_day"],
        end_day=report["end_day"],
        api_key=api_key,
        model=model,
    )
    keys_to_fallback = [
        "susceptible_pests",
        "pest_risk_factors",
        "pest_management",
        "susceptible_diseases",
        "disease_risk_factors",
        "disease_management"
    ]
    for k in keys_to_fallback:
        if not new_data.get(k):
            new_data[k] = report.get(k)

    # Return new data alongside original for diff — do NOT save yet
    return {**report, **new_data, "_is_regenerated": True}


# ── Generate Env Conditions (on-demand) ─────────────────────────────────

@router.post("/crop-knowledge/{uid}/generate-env")
async def generate_env_for_stage(uid: str, db: AsyncSession = Depends(get_db)):
    report = await queries.get_report_by_uid(db, uid)
    if not report:
        raise HTTPException(status_code=404, detail="Record not found")

    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    env = await generate_env_conditions(
        crop_name=report["crop_name"],
        main_stage=report["main_stage"],
        sub_stage_name=report["sub_stage_name"],
        start_day=report["start_day"] or 0,
        end_day=report["end_day"] or 0,
        api_key=api_key,
        model=model,
    )

    if not env:
        raise HTTPException(status_code=502, detail="Failed to generate environmental conditions")

    # Save directly to DB
    import json
    env_json = json.dumps(env) if isinstance(env, dict) else env
    from sqlalchemy import text
    await db.execute(text("""
        UPDATE crop_stage_knowledge
        SET env_conditions = CAST(:env AS jsonb), updated_at = now()
        WHERE uid = :uid
    """), {"uid": uid, "env": env_json})
    await db.commit()

    # Return updated full report
    return await queries.get_report_by_uid(db, uid)


# ── Add New Crop (Full Generation) ───────────────────────────────────────────

class GenerateCropPayload(BaseModel):
    crop_name: str

@router.post("/crop-knowledge/generate")
async def generate_crop_report(payload: GenerateCropPayload, db: AsyncSession = Depends(get_db)):
    crop_name = payload.crop_name.strip()
    if not crop_name:
        raise HTTPException(status_code=400, detail="Crop name cannot be empty")

    # 1. Check duplicate
    if await queries.crop_exists(db, crop_name):
        raise HTTPException(status_code=400, detail=f"Crop '{crop_name}' already exists in database")

    # 2. Call Gemini to discover phases and sub-stages
    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    import httpx

    # Reuse a single AsyncClient context manager to pool TCP/SSL connections across all concurrent calls
    async with httpx.AsyncClient(timeout=120) as client:
        stages = await generate_crop_stages_template(crop_name=crop_name, api_key=api_key, model=model, client=client)
        if not stages:
            raise HTTPException(status_code=502, detail="Failed to discover growth stages for this crop")

        # 3. Call regenerate_stage concurrently for all stages (paid API tier — no rate-limit sleep needed)
        stages_knowledge = await asyncio.gather(*[
            regenerate_stage(
                crop_name=crop_name,
                main_stage=s["main_stage"],
                sub_stage_name=s["sub_stage_name"],
                start_day=s["start_day"],
                end_day=s["end_day"],
                api_key=api_key,
                model=model,
                client=client,
            )
            for s in stages
        ])

    # 4. Map results and prepare database rows
    rows_to_insert = []
    for i, s in enumerate(stages):
        knowledge = stages_knowledge[i]
        
        # Clean/fallback fields
        row = {
            "uid": f"csk_{uuid4()}",
            "crop_name": crop_name,
            "main_stage": s["main_stage"],
            "sub_stage_name": s["sub_stage_name"],
            "start_day": s["start_day"],
            "end_day": s["end_day"],
            "susceptible_pests": knowledge.get("susceptible_pests") or "",
            "pest_risk_factors": knowledge.get("pest_risk_factors") or "",
            "pest_management": knowledge.get("pest_management") or "",
            "susceptible_diseases": knowledge.get("susceptible_diseases") or "",
            "disease_risk_factors": knowledge.get("disease_risk_factors") or "",
            "disease_management": knowledge.get("disease_management") or "",
            "env_conditions": knowledge.get("env_conditions"),
        }
        rows_to_insert.append(row)

    # 5. Insert rows into DB
    await queries.insert_crop_stages(db, rows_to_insert)

    return {
        "success": True,
        "stages_count": len(rows_to_insert),
        "crop_name": crop_name,
    }

