"""
All queries — ONLY reads/writes crop_stage_knowledge and crop_stage_translations.
No other tables are referenced anywhere in this file.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ── crop_stage_knowledge ─────────────────────────────────────────────────────

_SELECT_ALL = (
    "SELECT uid, crop_name, main_stage, sub_stage_name, start_day, end_day, "
    "       susceptible_pests, pest_risk_factors, pest_management, "
    "       susceptible_diseases, disease_risk_factors, disease_management, "
    "       env_conditions, data_source, created_at, updated_at "
    "FROM crop_stage_knowledge "
)

async def get_stats(db: AsyncSession) -> dict:
    total = (await db.execute(text("SELECT COUNT(*) FROM crop_stage_knowledge"))).scalar()
    unique_crops = (await db.execute(text("SELECT COUNT(DISTINCT crop_name) FROM crop_stage_knowledge"))).scalar()

    # stages that have no Kannada row in translations
    pending_kn = (await db.execute(text(
        "SELECT COUNT(*) FROM crop_stage_knowledge csk "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM crop_stage_translations cst "
        "  WHERE cst.knowledge_uid = csk.uid AND cst.language_code = 'kn'"
        ")"
    ))).scalar()

    # last 5 updated
    rows = (await db.execute(text(
        _SELECT_ALL + "ORDER BY updated_at DESC LIMIT 5"
    ))).fetchall()
    recent = [dict(r._mapping) for r in rows]

    # volume chart — records updated per day for last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    chart_rows = (await db.execute(
        text("SELECT DATE(updated_at) as date, COUNT(*) as count "
             "FROM crop_stage_knowledge WHERE updated_at >= :cutoff "
             "GROUP BY DATE(updated_at) ORDER BY date"),
        {"cutoff": cutoff}
    )).fetchall()
    chart = [{"date": str(r.date), "count": r.count} for r in chart_rows]

    return {
        "total_records": total,
        "unique_crops": unique_crops,
        "pending_translations": pending_kn,
        "recent_activity": [_serialize(r) for r in recent],
        "volume_chart": chart,
    }

async def list_reports(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 10,
    search: str = "",
    crops: str = "",
    sources: str = "",
) -> dict:
    conditions = ["1=1"]
    params: dict = {}

    if search:
        conditions.append(
            "(LOWER(crop_name) LIKE :search OR LOWER(sub_stage_name) LIKE :search OR LOWER(main_stage) LIKE :search)"
        )
        params["search"] = f"%{search.lower()}%"

    crop_list = [c for c in crops.split(",") if c]
    if crop_list:
        conditions.append(f"crop_name = ANY(:crops)")
        params["crops"] = crop_list

    source_list = [s for s in sources.split(",") if s]
    if source_list:
        conditions.append(f"data_source = ANY(:sources)")
        params["sources"] = source_list

    where = " WHERE " + " AND ".join(conditions)
    total = (await db.execute(text(f"SELECT COUNT(*) FROM crop_stage_knowledge{where}"), params)).scalar()

    offset = (page - 1) * page_size
    rows = (await db.execute(
        text(f"{_SELECT_ALL}{where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset"),
        {**params, "limit": page_size, "offset": offset}
    )).fetchall()

    all_crops_rows = (await db.execute(text("SELECT DISTINCT crop_name FROM crop_stage_knowledge ORDER BY crop_name"))).fetchall()
    all_crops = [r[0] for r in all_crops_rows]

    return {
        "total": total,
        "items": [_serialize(dict(r._mapping)) for r in rows],
        "all_crops": all_crops,
    }

async def get_report_by_uid(db: AsyncSession, uid: str) -> Optional[dict]:
    row = (await db.execute(
        text(_SELECT_ALL + "WHERE uid = :uid LIMIT 1"), {"uid": uid}
    )).fetchone()
    return _serialize(dict(row._mapping)) if row else None

async def upsert_report(db: AsyncSession, uid: str, data: dict) -> dict:
    await db.execute(
        text(
            "UPDATE crop_stage_knowledge SET "
            "  susceptible_pests    = :susceptible_pests, "
            "  pest_risk_factors    = :pest_risk_factors, "
            "  pest_management      = :pest_management, "
            "  susceptible_diseases = :susceptible_diseases, "
            "  disease_risk_factors = :disease_risk_factors, "
            "  disease_management   = :disease_management, "
            "  data_source          = 'llm', "
            "  updated_at           = now() "
            "WHERE uid = :uid"
        ),
        {"uid": uid, **data},
    )
    await db.commit()
    return await get_report_by_uid(db, uid)

# ── crop_stage_translations ──────────────────────────────────────────────────

async def get_translation(db: AsyncSession, knowledge_uid: str, language_code: str) -> Optional[dict]:
    row = (await db.execute(
        text(
            "SELECT crop_name_local, phase_name_local, stage_name_local, "
            "       pest_data_local, disease_data_local, env_data_local "
            "FROM crop_stage_translations "
            "WHERE knowledge_uid = :uid AND language_code = :lang LIMIT 1"
        ),
        {"uid": knowledge_uid, "lang": language_code},
    )).fetchone()
    return dict(row._mapping) if row else None

async def save_translation(db: AsyncSession, knowledge_uid: str, language_code: str, data: dict) -> None:
    from uuid import uuid4
    t_uid = f"cst_{uuid4()}"
    await db.execute(
        text(
            "INSERT INTO crop_stage_translations "
            "  (uid, knowledge_uid, language_code, "
            "   crop_name_local, phase_name_local, stage_name_local, "
            "   pest_data_local, disease_data_local, env_data_local, created_at) "
            "VALUES (:uid, :k_uid, :lang, "
            "   :crop_name_local, :phase_name_local, :stage_name_local, "
            "   :pest_data_local, :disease_data_local, :env_data_local, now()) "
            "ON CONFLICT (knowledge_uid, language_code) DO UPDATE SET "
            "  crop_name_local    = EXCLUDED.crop_name_local, "
            "  phase_name_local   = EXCLUDED.phase_name_local, "
            "  stage_name_local   = EXCLUDED.stage_name_local, "
            "  pest_data_local    = EXCLUDED.pest_data_local, "
            "  disease_data_local = EXCLUDED.disease_data_local, "
            "  env_data_local     = EXCLUDED.env_data_local"
        ),
        {
            "uid": t_uid, "k_uid": knowledge_uid, "lang": language_code,
            "crop_name_local":   data.get("crop_name_local"),
            "phase_name_local":  data.get("phase_name_local"),
            "stage_name_local":  data.get("stage_name_local"),
            "pest_data_local":   data.get("pest_data_local"),
            "disease_data_local": data.get("disease_data_local"),
            "env_data_local":    data.get("env_data_local"),
        },
    )
    await db.commit()

# ── Admin queries ─────────────────────────────────────────────────────────────

async def get_all_crops_summary(db: AsyncSession) -> list:
    rows = (await db.execute(text(
        "SELECT crop_name, "
        "  COUNT(*) AS total_stages, "
        "  SUM(CASE WHEN data_source='llm' THEN 1 ELSE 0 END) AS llm_stages, "
        "  SUM(CASE WHEN data_source='csv' THEN 1 ELSE 0 END) AS csv_stages, "
        "  (SELECT COUNT(*) FROM crop_stage_translations cst "
        "   WHERE cst.knowledge_uid IN (SELECT uid FROM crop_stage_knowledge WHERE crop_name = csk.crop_name) "
        "   AND cst.language_code = 'kn') AS kn_translated_stages "
        "FROM crop_stage_knowledge csk "
        "GROUP BY crop_name ORDER BY crop_name"
    ))).fetchall()
    return [dict(r._mapping) for r in rows]

async def get_translation_status(db: AsyncSession) -> list:
    rows = (await db.execute(text(
        "SELECT csk.uid, csk.crop_name, csk.main_stage, csk.sub_stage_name, "
        "       csk.start_day, csk.end_day, "
        "       EXISTS(SELECT 1 FROM crop_stage_translations cst "
        "              WHERE cst.knowledge_uid = csk.uid AND cst.language_code = 'kn') AS has_kn "
        "FROM crop_stage_knowledge csk "
        "ORDER BY csk.crop_name, csk.start_day"
    ))).fetchall()
    return [dict(r._mapping) for r in rows]

async def crop_exists(db: AsyncSession, crop_name: str) -> bool:
    res = await db.execute(
        text("SELECT 1 FROM crop_stage_knowledge WHERE LOWER(crop_name) = LOWER(:crop_name) LIMIT 1"),
        {"crop_name": crop_name}
    )
    return res.fetchone() is not None

async def insert_crop_stages(db: AsyncSession, rows: list[dict]) -> None:
    for row in rows:
        await db.execute(
            text("""
                INSERT INTO crop_stage_knowledge (
                    uid, crop_name, main_stage, sub_stage_name, start_day, end_day,
                    susceptible_pests, pest_risk_factors, pest_management,
                    susceptible_diseases, disease_risk_factors, disease_management,
                    data_source, created_at, updated_at
                ) VALUES (
                    :uid, :crop_name, :main_stage, :sub_stage_name, :start_day, :end_day,
                    :susceptible_pests, :pest_risk_factors, :pest_management,
                    :susceptible_diseases, :disease_risk_factors, :disease_management,
                    'llm', now(), now()
                )
            """),
            row
        )
    await db.commit()

async def delete_crop(db: AsyncSession, crop_name: str) -> None:
    # Delete translations for crop stages belonging to this crop first
    await db.execute(
        text("DELETE FROM crop_stage_translations WHERE knowledge_uid IN (SELECT uid FROM crop_stage_knowledge WHERE LOWER(crop_name) = LOWER(:crop_name))"),
        {"crop_name": crop_name}
    )
    # Delete the crop stages
    await db.execute(
        text("DELETE FROM crop_stage_knowledge WHERE LOWER(crop_name) = LOWER(:crop_name)"),
        {"crop_name": crop_name}
    )
    await db.commit()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    for k, v in row.items():
        if isinstance(v, datetime):
            row[k] = v.isoformat()
        elif isinstance(v, str) and k == "env_conditions":
            try: row[k] = json.loads(v)
            except: pass
    return row
