from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_analysis_model: str = "llama3.1:8b"
    ollama_interview_model: str = "mistral:7b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_embed_dims: int = 768

    # pgvector scoring weights
    vector_similarity_weight: float = 0.40
    llm_score_weight: float = 0.60
    duplicate_threshold: float = 0.97
    question_dedup_threshold: float = 0.90

    # Database
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5433/hiringbot"
    redis_url: str = "redis://localhost:6379"

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

    # App
    secret_key: str = "change-me-in-production"
    webhook_base_url: str = "https://your-ngrok-url.ngrok.io"
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
