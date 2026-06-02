"""
FastAPI backend for Crop Knowledge Dashboard.
Touches ONLY: crop_stage_knowledge, crop_stage_translations
"""
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure local backend modules can be resolved on Vercel
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

load_dotenv()

from routers import crop_knowledge, translations, admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database tables on startup if they don't exist
    from database import init_db
    try:
        print("[Startup] Initializing database tables...")
        await init_db()
        print("[Startup] Database tables initialized successfully.")
    except Exception as e:
        print(f"[Startup ERROR] Failed to initialize database: {e}")
    yield  # startup / shutdown hooks go here if needed

app = FastAPI(title="Crop Knowledge Dashboard API", lifespan=lifespan)

# CORS — allow React dev server
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(crop_knowledge.router, prefix="/api")
app.include_router(translations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/health-check")
async def health_check():
    """Safe health check — confirms API is running without exposing any credentials."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    db_url = os.getenv("DATABASE_URL", "")
    return {
        "status": "ok",
        "gemini_configured": bool(gemini_key),
        "db_configured": bool(db_url),
    }
