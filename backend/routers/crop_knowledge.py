"""
Router: /api/stats, /api/crop-knowledge
Read endpoints are public (dashboard UI needs them).
All write/mutating endpoints require X-Admin-Key header.
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
from auth import require_admin_key
import asyncio
from uuid import uuid4
from fastapi import HTTPException

router = APIRouter()

# ── Stats (public) ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    return await queries.get_stats(db)

# ── List / Search (public) ────────────────────────────────────────────────────

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

# ── Single record (public) ────────────────────────────────────────────────────

@router.get("/crop-knowledge/{uid}")
async def get_report(uid: str, db: AsyncSession = Depends(get_db)):
    report = await queries.get_report_by_uid(db, uid)
    if not report:
        raise HTTPException(status_code=404, detail="Record not found")
    return report

# ── Save revision (admin key required) ───────────────────────────────────────

class SavePayload(BaseModel):
    susceptible_pests:    Optional[str] = None
    pest_risk_factors:    Optional[str] = None
    pest_management:      Optional[str] = None
    susceptible_diseases: Optional[str] = None
    disease_risk_factors: Optional[str] = None
    disease_management:   Optional[str] = None

@router.put("/crop-knowledge/{uid}", dependencies=[Depends(require_admin_key)])
async def save_report(uid: str, payload: SavePayload, db: AsyncSession = Depends(get_db)):
    updated = await queries.upsert_report(db, uid, payload.model_dump())
    return updated

# ── Regenerate via Gemini (admin key required) ────────────────────────────────

@router.post("/crop-knowledge/{uid}/regenerate", dependencies=[Depends(require_admin_key)])
async def regenerate_report(uid: str, db: AsyncSession = Depends(get_db)):
    report = await queries.get_report_by_uid(db, uid)
    if not report:
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
        "susceptible_pests", "pest_risk_factors", "pest_management",
        "susceptible_diseases", "disease_risk_factors", "disease_management"
    ]
    for k in keys_to_fallback:
        if not new_data.get(k):
            new_data[k] = report.get(k)

    # Return new data alongside original for diff — do NOT save yet
    return {**report, **new_data, "_is_regenerated": True}


# ── Generate Env Conditions (admin key required) ──────────────────────────────

@router.post("/crop-knowledge/{uid}/generate-env", dependencies=[Depends(require_admin_key)])
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

    import json
    env_json = json.dumps(env) if isinstance(env, dict) else env
    from sqlalchemy import text
    await db.execute(text("""
        UPDATE crop_stage_knowledge
        SET env_conditions = CAST(:env AS jsonb), updated_at = now()
        WHERE uid = :uid
    """), {"uid": uid, "env": env_json})
    await db.commit()

    return await queries.get_report_by_uid(db, uid)


# ── Add New Crop (admin key required) ─────────────────────────────────────────

class GenerateCropPayload(BaseModel):
    crop_name: str

@router.post("/crop-knowledge/generate", dependencies=[Depends(require_admin_key)])
async def generate_crop_report(payload: GenerateCropPayload, db: AsyncSession = Depends(get_db)):
    crop_name = payload.crop_name.strip()
    if not crop_name:
        raise HTTPException(status_code=400, detail="Crop name cannot be empty")

    if await queries.crop_exists(db, crop_name):
        raise HTTPException(status_code=400, detail=f"Crop '{crop_name}' already exists in database")

    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    import httpx
    import logging
    from gemini_service import generate_env_conditions as gen_env

    logger = logging.getLogger(__name__)

    async with httpx.AsyncClient(timeout=120) as client:
        stages, stages_error = await generate_crop_stages_template(
            crop_name=crop_name, api_key=api_key, model=model, client=client
        )
        if not stages:
            detail = f"Failed to discover growth stages: {stages_error}" if stages_error else "Failed to discover growth stages for this crop"
            raise HTTPException(status_code=502, detail=detail)

        async def fetch_with_retry(func, retries=2, **kwargs):
            for attempt in range(retries + 1):
                try:
                    return await func(**kwargs)
                except Exception as e:
                    if attempt == retries:
                        logger.error("Function failed after %d retries: %s", retries, e)
                        return None
                    await asyncio.sleep(1)

        async def fetch_stage_data(s):
            """Fetch both pest/disease data and env conditions for one stage."""
            knowledge = await fetch_with_retry(
                regenerate_stage,
                crop_name=crop_name,
                main_stage=s["main_stage"],
                sub_stage_name=s["sub_stage_name"],
                start_day=s["start_day"],
                end_day=s["end_day"],
                api_key=api_key,
                model=model,
                client=client,
            )
            env = await fetch_with_retry(
                gen_env,
                crop_name=crop_name,
                main_stage=s["main_stage"],
                sub_stage_name=s["sub_stage_name"],
                start_day=s["start_day"],
                end_day=s["end_day"],
                api_key=api_key,
                model=model,
            )
            return knowledge or {}, env

        results = await asyncio.gather(*[fetch_stage_data(s) for s in stages])

    rows_to_insert = []
    for i, s in enumerate(stages):
        knowledge, env = results[i]
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
            "env_conditions": env,
        }
        rows_to_insert.append(row)

    await queries.insert_crop_stages(db, rows_to_insert)

    return {
        "success": True,
        "stages_count": len(rows_to_insert),
        "crop_name": crop_name,
    }
