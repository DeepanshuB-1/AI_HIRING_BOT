from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # Ollama
    # Analysis (Layers 2-4, 6 — structured JSON, scoring, reports):
    #   Good:    llama3.1:8b   (4.7GB)
    #   Better:  qwen2.5:7b    (4.7GB) — much better JSON consistency
    #   Best:    qwen2.5:14b   (9.0GB) — requires 10GB+ VRAM
    # Interview (Layer 5 — live voice call, speed matters most):
    #   Good:    mistral:7b    (4.1GB)
    #   Better:  llama3.2:3b   (2.0GB) — faster, still good conversation
    ollama_base_url: str = "http://localhost:11434"
    ollama_analysis_model: str = "qwen2.5:7b"
    ollama_interview_model: str = "llama3.2:3b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_embed_dims: int = 768

    # pgvector scoring weights
    vector_similarity_weight: float = 0.40
    llm_score_weight: float = 0.60
    duplicate_threshold: float = 0.97
    question_dedup_threshold: float = 0.90

    # Temperature per layer (lower = more consistent JSON; higher = more natural conversation)
    temp_extraction: float = 0.1   # Layer 2 — profile extraction (strict JSON)
    temp_scoring: float = 0.1      # Layer 3 — JD scoring (strict JSON)
    temp_question_gen: float = 0.5 # Layer 4 — question generation (varied output)
    temp_voice: float = 0.6        # Layer 5 — live conversation (natural speech)
    temp_report: float = 0.2       # Layer 6 — report generation (structured)

    # Database
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5433/hiringbot"
    redis_url: str = "redis://localhost:6379"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    # Deepgram (optional fallback — not required when faster-whisper is active)
    deepgram_api_key: str = ""

    # faster-whisper STT (local, no API key needed)
    # Sizes: tiny | base | small | medium | large-v3
    # small.en = best for 8kHz phone audio (3-4x faster than medium, zero VRAM — runs on CPU).
    whisper_model_size: str = "small.en"

    # SendGrid
    sendgrid_api_key: str = ""
    from_email: str = "hr@yourcompany.com"

    # CORS — comma-separated origins, e.g. "http://localhost:5173,https://myapp.com"
    frontend_origins: str = "http://localhost:3000,http://localhost:5173"

    # App
    secret_key: str = "change-me-in-production"
    webhook_base_url: str = "https://your-ngrok-url.ngrok.io"
    frontend_url: str = "http://localhost:5173"
    upload_dir: str = "./uploads"
    audio_cache_dir: str = "./audio_cache"
    auto_reject_threshold: int = 40
    call_retry_count: int = 3
    call_retry_interval_minutes: int = 30

    # Scheduling
    scheduler_enabled: bool = True
    call_window_start: int = 9   # earliest hour to place calls (24h, IST)
    call_window_end: int = 18    # latest hour to place calls (24h, IST)
    auto_schedule_interval_minutes: int = 5
    max_concurrent_calls: int = 1  # local Ollama GPU can only handle 1 at a time

    # Voice interview timing (T1, T2)
    gather_silence_seconds: int = 5      # how long of silence ends the candidate's turn
    gather_start_timeout: int = 12       # how long to wait for candidate to start speaking
    max_call_minutes: int = 9            # set to 9 on trial; raise to 25 after upgrading Twilio
    wrapup_buffer_seconds: int = 75      # start wrap-up this many seconds before the hard cap
    questions_per_interview: int = 8     # 8 questions + probes fits even a 25-min call

    # Company / notifications
    company_name: str = "Our Company"
    hr_email: str = "hr@yourcompany.com"

    # Deployment environment — "development" (default, permissive) or "production"
    # (startup fails fast on insecure defaults). Set ENVIRONMENT=production when deploying.
    environment: str = "development"
    # Set false to run without Twilio configured (disables the prod credential check).
    voice_enabled: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in ("production", "prod")


# Values that indicate a setting was never customised away from its shipped placeholder.
_PLACEHOLDER_SECRET_KEYS = {
    "change-me-in-production",
    "your_jwt_secret_key_change_this_in_production",
    "changeme",
    "secret",
}
_PLACEHOLDER_WEBHOOK_FRAGMENTS = ("your-ngrok-url", "your_ngrok", "example.com", "changeme")


def validate_production_settings(s: "Settings") -> list[str]:
    """
    Return a list of human-readable configuration problems that must be fixed before
    running in production. Never includes secret values — only the offending setting name.
    """
    problems: list[str] = []

    if not s.secret_key or s.secret_key.strip().lower() in _PLACEHOLDER_SECRET_KEYS:
        problems.append("SECRET_KEY is unset or still the shipped default — generate a random value")
    elif len(s.secret_key) < 32:
        problems.append("SECRET_KEY is shorter than 32 characters — use a longer random value")

    webhook = (s.webhook_base_url or "").strip().lower()
    if not webhook:
        problems.append("WEBHOOK_BASE_URL is not set")
    elif any(frag in webhook for frag in _PLACEHOLDER_WEBHOOK_FRAGMENTS):
        problems.append("WEBHOOK_BASE_URL is still a placeholder — set your real public HTTPS URL")
    elif not webhook.startswith("https://"):
        problems.append("WEBHOOK_BASE_URL must use https:// in production")

    if s.voice_enabled:
        missing = [
            name
            for name, value in (
                ("TWILIO_ACCOUNT_SID", s.twilio_account_sid),
                ("TWILIO_AUTH_TOKEN", s.twilio_auth_token),
                ("TWILIO_PHONE_NUMBER", s.twilio_phone_number),
            )
            if not (value or "").strip()
        ]
        if missing:
            problems.append(
                "Voice is enabled but these Twilio settings are missing: "
                + ", ".join(missing)
                + " (set VOICE_ENABLED=false to run without voice)"
            )

    return problems


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
