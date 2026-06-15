import asyncio
import logging
from contextlib import asynccontextmanager

# Show INFO-level application logs (voice timing, LLM latency, etc.) in the terminal.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s [%(name)s] %(message)s",
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import settings
from backend.database import create_tables
from backend.redis_client import ping_redis
from backend.routers import hr, voice, auth, portal, question_bank
from backend.scheduler import start_scheduler, stop_scheduler
import backend.models  # noqa: F401 — ensures all tables are registered before create_all()

logger = logging.getLogger(__name__)


async def _warmup_ollama():
    """Pre-load both Ollama models and pre-synthesize static TTS phrases at startup."""
    def _do():
        # Load analysis model
        from backend.services.ollama_client import _client, ANALYSIS_MODEL
        try:
            _client.chat(model=ANALYSIS_MODEL, messages=[{"role": "user", "content": "hello"}],
                         keep_alive="10m", options={"num_predict": 1})
            print(f"[warmup] {ANALYSIS_MODEL} ready")
        except Exception as exc:
            print(f"[warmup] {ANALYSIS_MODEL} failed: {exc}")

        # Load interview model via ollama_stream_voice (uses keep_alive="30m")
        from backend.services.ollama_client import ollama_stream_voice
        try:
            ollama_stream_voice("hello", max_sentences=1)
            from backend.services.ollama_client import INTERVIEW_MODEL
            print(f"[warmup] {INTERVIEW_MODEL} ready (voice path)")
        except Exception as exc:
            print(f"[warmup] interview model failed: {exc}")

        # Pre-synthesize static phrases so they are cache hits during calls
        from backend.voice.tts import synthesize
        static_phrases = [
            # existing error / repeat phrases
            "I didn't catch that — could you speak a little louder or closer to the phone?",
            "I'm sorry, I didn't quite catch that — could you say that again?",
            "I haven't been able to hear you for a while. If you'd like to continue please say something now, otherwise I'll wrap up — thank you so much for your time.",
            "Sure! Here's the question again:",
            # T3: 3-tier silence nudges
            "Take your time — I'm listening whenever you're ready.",
            "Would you like me to repeat the question?",
            # H2: instant backchannel fillers
            "Mm-hmm.",
            "Right.",
            "Okay.",
            "Got it.",
            "Alright.",
        ]
        cached = 0
        for phrase in static_phrases:
            try:
                if synthesize(phrase):
                    cached += 1
            except Exception:
                pass
        if cached:
            print(f"[warmup] {cached} static TTS phrases cached")

    await asyncio.to_thread(_do)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await create_tables()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.audio_cache_dir).mkdir(parents=True, exist_ok=True)
    redis_ok = ping_redis()
    start_scheduler()
    print(f"[startup] DB tables ready | Redis: {'OK' if redis_ok else 'UNREACHABLE'} | Scheduler: {'ON' if settings.scheduler_enabled else 'OFF'}")
    # Pre-warm models in background so first voice call is fast (avoids Twilio 15s timeout)
    asyncio.create_task(_warmup_ollama())
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
app.include_router(question_bank.router)
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
