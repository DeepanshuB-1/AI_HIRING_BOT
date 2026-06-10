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

    # Deepgram
    deepgram_api_key: str = ""

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

    # Company / notifications
    company_name: str = "Our Company"
    hr_email: str = "hr@yourcompany.com"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
