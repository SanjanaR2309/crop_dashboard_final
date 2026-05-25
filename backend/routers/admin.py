"""
Router: /api/admin
Admin overview — crop index and translation health
Only touches: crop_stage_knowledge, crop_stage_translations
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
import queries

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

