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

@app.get("/api/debug")
async def debug_env():
    """Diagnostic endpoint — shows env config and tests Gemini connection live."""
    import httpx
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    db_url = os.getenv("DATABASE_URL", "")

    # Mask sensitive values
    key_status = f"SET ({gemini_key[:8]}...)" if gemini_key else "MISSING ❌"
    db_status = f"SET ({db_url[:20]}...)" if db_url else "MISSING ❌"

    gemini_test = "not attempted"
    if gemini_key:
        try:
            test_payload = {
                "contents": [{"role": "user", "parts": [{"text": "Reply with valid JSON: {\"ok\": true}"}]}],
                "generationConfig": {"maxOutputTokens": 50, "temperature": 0.0, "responseMimeType": "application/json"},
            }
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}",
                    json=test_payload,
                    headers={"content-type": "application/json"},
                )
            if r.status_code == 200:
                raw = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                gemini_test = f"OK ✅ — response: {raw[:80]}"
            else:
                gemini_test = f"FAILED ❌ — HTTP {r.status_code}: {r.text[:200]}"
        except Exception as e:
            gemini_test = f"ERROR ❌ — {str(e)[:200]}"

    return {
        "GEMINI_API_KEY": key_status,
        "GEMINI_MODEL": model,
        "DATABASE_URL": db_status,
        "ALLOWED_ORIGINS": os.getenv("ALLOWED_ORIGINS", "not set"),
        "gemini_live_test": gemini_test,
    }
