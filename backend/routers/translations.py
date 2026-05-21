"""
Router: /api/translations
Only touches: crop_stage_translations
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from database import get_db
import queries
from gemini_service import translate_stage

router = APIRouter()


@router.get("/translations/{uid}")
async def get_translation(uid: str, lang: str = "kn", db: AsyncSession = Depends(get_db)):
    """
    Fetch translation for a knowledge uid + language.
    If not cached in DB, calls Gemini to generate it, stores it, then returns it.
    """
    cached = await queries.get_translation(db, uid, lang)
    if cached:
        return cached

    # Cache miss — generate via Gemini
    report = await queries.get_report_by_uid(db, uid)
    if not report:
        raise HTTPException(status_code=404, detail="Knowledge record not found")

    api_key = os.getenv("GEMINI_API_KEY", "")
    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    pest_text    = f"{report.get('susceptible_pests', '')} | {report.get('pest_management', '')}"
    disease_text = f"{report.get('susceptible_diseases', '')} | {report.get('disease_management', '')}"
    env_raw      = report.get("env_conditions") or ""
    env_text     = env_raw if isinstance(env_raw, str) else str(env_raw)

    translation = await translate_stage(
        crop_name=report["crop_name"],
        phase_name=report["main_stage"],
        stage_name=report["sub_stage_name"],
        pest_text=pest_text,
        disease_text=disease_text,
        env_text=env_text,
        language_code=lang,
        api_key=api_key,
        model=model,
    )

    # Store in crop_stage_translations
    await queries.save_translation(db, uid, lang, translation)
    return translation


class TranslationPayload(BaseModel):
    lang: str = "kn"
    crop_name_local:    Optional[str] = None
    phase_name_local:   Optional[str] = None
    stage_name_local:   Optional[str] = None
    pest_data_local:    Optional[str] = None
    disease_data_local: Optional[str] = None
    env_data_local:     Optional[str] = None


@router.put("/translations/{uid}")
async def update_translation(uid: str, payload: TranslationPayload, db: AsyncSession = Depends(get_db)):
    """Manually override/save a translation."""
    await queries.save_translation(db, uid, payload.lang, payload.model_dump(exclude={"lang"}))
    return {"status": "saved"}
