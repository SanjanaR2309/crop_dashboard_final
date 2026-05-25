"""
Router: /api/admin
Admin overview — crop index and translation health
Only touches: crop_stage_knowledge, crop_stage_translations
"""
import os
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
import queries
from gemini_service import regenerate_stage

router = APIRouter()


@router.get("/admin/crops")
async def get_crops(db: AsyncSession = Depends(get_db)):
    return await queries.get_all_crops_summary(db)


@router.get("/admin/translation-status")
async def get_translation_status(db: AsyncSession = Depends(get_db)):
    return await queries.get_translation_status(db)


@router.delete("/admin/crops/{crop_name}")
async def delete_crop(crop_name: str, db: AsyncSession = Depends(get_db)):
    await queries.delete_crop(db, crop_name)
    return {"success": True, "message": f"Successfully deleted crop '{crop_name}' and all associated growth stages."}


@router.get("/admin/test-regen")
async def test_regen():
    """Test a single regenerate_stage call — confirms Gemini is working end-to-end."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    result = await regenerate_stage(
        crop_name="Rice",
        main_stage="Vegetative Phase",
        sub_stage_name="Tillering",
        start_day=15,
        end_day=45,
        api_key=api_key,
        model=model,
    )
    return {
        "api_key_set": bool(api_key),
        "model": model,
        "result": result,
        "fields_populated": {k: v is not None and v != "" for k, v in result.items()},
    }


@router.post("/admin/regen-empty")
async def regen_empty_stages(db: AsyncSession = Depends(get_db)):
    """
    Finds all stages in the DB where pest_management or disease_management is NULL/empty
    and re-generates their advisory data via Gemini. Fixes all broken records in bulk.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    if not api_key:
        return {"error": "GEMINI_API_KEY not set"}

    # Find all stages with any null advisory field
    rows = (await db.execute(text("""
        SELECT uid, crop_name, main_stage, sub_stage_name, start_day, end_day
        FROM crop_stage_knowledge
        WHERE pest_management IS NULL OR pest_management = ''
           OR disease_management IS NULL OR disease_management = ''
           OR susceptible_pests IS NULL OR susceptible_pests = ''
        ORDER BY crop_name, start_day
    """))).fetchall()

    if not rows:
        return {"message": "All stages already have data — nothing to fix!", "fixed": 0}

    total = len(rows)
    fixed = 0
    errors = []

    # Process in batches of 5 to avoid rate limiting
    batch_size = 5
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        results = await asyncio.gather(*[
            regenerate_stage(
                crop_name=r.crop_name,
                main_stage=r.main_stage,
                sub_stage_name=r.sub_stage_name,
                start_day=r.start_day or 0,
                end_day=r.end_day or 0,
                api_key=api_key,
                model=model,
            )
            for r in batch
        ], return_exceptions=True)

        for row, res in zip(batch, results):
            if isinstance(res, Exception):
                errors.append(f"{row.crop_name}/{row.sub_stage_name}: {str(res)[:80]}")
                continue

            has_data = any(v for v in res.values() if v)
            if not has_data:
                errors.append(f"{row.crop_name}/{row.sub_stage_name}: Gemini returned empty")
                continue

            await db.execute(text("""
                UPDATE crop_stage_knowledge SET
                    susceptible_pests    = :susceptible_pests,
                    pest_risk_factors    = :pest_risk_factors,
                    pest_management      = :pest_management,
                    susceptible_diseases = :susceptible_diseases,
                    disease_risk_factors = :disease_risk_factors,
                    disease_management   = :disease_management,
                    data_source          = 'llm',
                    updated_at           = now()
                WHERE uid = :uid
            """), {"uid": row.uid, **{k: res.get(k) or "" for k in [
                "susceptible_pests", "pest_risk_factors", "pest_management",
                "susceptible_diseases", "disease_risk_factors", "disease_management"
            ]}})
            fixed += 1

        await db.commit()
        # Small pause between batches
        if i + batch_size < total:
            await asyncio.sleep(0.5)

    return {
        "total_empty_stages": total,
        "fixed": fixed,
        "errors": errors,
        "message": f"Fixed {fixed}/{total} stages successfully.",
    }
