from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import settings
from backend.database import create_tables
from backend.redis_client import ping_redis
from backend.routers import hr
import backend.models  # noqa: F401 — ensures all tables are registered before create_all()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await create_tables()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.audio_cache_dir).mkdir(parents=True, exist_ok=True)
    redis_ok = ping_redis()
    print(f"[startup] DB tables ready | Redis: {'OK' if redis_ok else 'UNREACHABLE'}")
    yield
    # shutdown (nothing to teardown yet)


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
audio_path = Path(settings.audio_cache_dir)
audio_path.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(audio_path)), name="audio")

# routers
app.include_router(hr.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "redis": ping_redis(),
        "ollama_analysis_model": settings.ollama_analysis_model,
        "ollama_interview_model": settings.ollama_interview_model,
    }
