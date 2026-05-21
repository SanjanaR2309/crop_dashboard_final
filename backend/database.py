"""
Async SQLAlchemy engine — reads DATABASE_URL from .env
ONLY accesses: crop_stage_knowledge, crop_stage_translations
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

def sanitize_db_url(url: str) -> str:
    if not url:
        return url
    # Convert postgres:// or postgresql:// to postgresql+asyncpg:// for SQLAlchemy async engine compatibility
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # Replace sslmode=require with ssl=require for asyncpg driver compatibility
    if "sslmode=" in url:
        url = url.replace("sslmode=", "ssl=")
    return url

DATABASE_URL = sanitize_db_url(os.getenv("DATABASE_URL"))

engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    echo=os.getenv("DEBUG", "0") == "1",
)

AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """Checks and automatically creates required tables, constraints, and indexes if they are not found in the database."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        # Create crop_stage_knowledge table if it doesn't exist
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crop_stage_knowledge (
                uid VARCHAR PRIMARY KEY,
                crop_name VARCHAR NOT NULL,
                main_stage VARCHAR,
                sub_stage_name VARCHAR,
                start_day INTEGER,
                end_day INTEGER,
                data_source VARCHAR,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                deleted_at TIMESTAMPTZ,
                susceptible_pests TEXT,
                pest_risk_factors TEXT,
                pest_management TEXT,
                susceptible_diseases TEXT,
                disease_risk_factors TEXT,
                disease_management TEXT,
                env_conditions JSONB,
                CONSTRAINT uq_crop_sub_stage_window UNIQUE (crop_name, sub_stage_name, start_day, end_day)
            );
        """))
        
        # Create indexes for crop_stage_knowledge if they don't exist
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_csk_crop_name ON crop_stage_knowledge(crop_name);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_csk_crop_days ON crop_stage_knowledge(crop_name, start_day, end_day);"))
        
        # Create crop_stage_translations table if it doesn't exist
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crop_stage_translations (
                uid TEXT PRIMARY KEY,
                knowledge_uid TEXT NOT NULL,
                language_code TEXT NOT NULL,
                crop_name_local TEXT,
                phase_name_local TEXT,
                stage_name_local TEXT,
                pest_data_local TEXT,
                disease_data_local TEXT,
                env_data_local TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        """))
        
        # Create index for crop_stage_translations if it doesn't exist
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_cst_knowledge_lang ON crop_stage_translations(knowledge_uid, language_code);"))

