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
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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
    try:
        raw = _ollama.list()
        # ollama 0.2.x returns a dict; newer versions return an object with .models
        model_list = raw.get('models', []) if isinstance(raw, dict) else raw.models
        pulled = [
            (m.get('name') or m.get('model', '')) if isinstance(m, dict) else (m.model or m.name)
            for m in model_list
        ]
        def _pulled(name: str) -> bool:
            return any(p == name or p.startswith(name + ":") for p in pulled)
        ollama_ok = _pulled(settings.ollama_analysis_model)
        ollama_embed_ok = _pulled(settings.ollama_embed_model)
    except Exception:
        ollama_ok = False
        ollama_embed_ok = False

    return {
        "status": "ok",
        "redis": ping_redis(),
        "ollama_analysis_model": ollama_ok,
        "ollama_embed_model": ollama_embed_ok,
    }
