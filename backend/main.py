from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import settings
from backend.database import create_tables
from backend.redis_client import ping_redis
from backend.routers import hr, voice, auth, portal
from backend.scheduler import start_scheduler, stop_scheduler
import backend.models  # noqa: F401 — ensures all tables are registered before create_all()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await create_tables()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.audio_cache_dir).mkdir(parents=True, exist_ok=True)
    redis_ok = ping_redis()
    start_scheduler()
    print(f"[startup] DB tables ready | Redis: {'OK' if redis_ok else 'UNREACHABLE'} | Scheduler: {'ON' if settings.scheduler_enabled else 'OFF'}")
    yield
    # shutdown
    stop_scheduler()


app = FastAPI(
    title="AI Hiring Bot",
    description="Automated voice-driven recruitment screening powered by Ollama",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.frontend_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve cached TTS audio files
app.mount("/audio", StaticFiles(directory=str(Path(settings.audio_cache_dir))), name="audio")

# routers
app.include_router(auth.router)
app.include_router(portal.router)
app.include_router(hr.router)
app.include_router(voice.router)


@app.get("/health")
async def health():
    import ollama as _ollama
    from backend.database import engine as _engine
    from sqlalchemy import text as _text

    # Ollama model check
    try:
        raw = _ollama.list()
        model_list = raw.get('models', []) if isinstance(raw, dict) else raw.models
        pulled = [
            (m.get('name') or m.get('model', '')) if isinstance(m, dict) else (m.model or m.name)
            for m in model_list
        ]
        def _pulled(name: str) -> bool:
            return any(p == name or p.startswith(name + ":") for p in pulled)
        ollama_analysis_ok = _pulled(settings.ollama_analysis_model)
        ollama_interview_ok = _pulled(settings.ollama_interview_model)
        ollama_embed_ok = _pulled(settings.ollama_embed_model)
    except Exception:
        ollama_analysis_ok = ollama_interview_ok = ollama_embed_ok = False

    # PostgreSQL check
    try:
        async with _engine.connect() as conn:
            await conn.execute(_text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # Celery worker check
    try:
        from backend.celery_app import celery as _celery
        inspector = _celery.control.inspect(timeout=1.5)
        active = inspector.active() or {}
        analysis_workers = any("analysis_queue" in str(v) or True for v in active.values()) if active else False
        celery_workers = len(active)
    except Exception:
        analysis_workers = False
        celery_workers = 0

    redis_ok = ping_redis()
    all_ok = redis_ok and db_ok and ollama_analysis_ok and ollama_embed_ok

    return {
        "status": "ok" if all_ok else "degraded",
        "redis": redis_ok,
        "database": db_ok,
        "celery_workers_online": celery_workers,
        "ollama_analysis_model": ollama_analysis_ok,
        "ollama_interview_model": ollama_interview_ok,
        "ollama_embed_model": ollama_embed_ok,
    }
