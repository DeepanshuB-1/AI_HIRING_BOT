import hashlib
import logging
from pathlib import Path
from backend.config import settings

logger = logging.getLogger(__name__)


def _cache_path(text: str) -> Path:
    h = hashlib.md5(text.encode()).hexdigest()
    return Path(settings.audio_cache_dir) / f"{h}.mp3"


def synthesize(text: str) -> str:
    """
    Generate TTS audio via ElevenLabs and return the /audio/<file> URL path.
    Caches by MD5 of text so identical phrases are never regenerated.
    Returns "" if ElevenLabs is unconfigured — caller falls back to Twilio <Say>.
    """
    if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
        return ""  # not configured — use Twilio <Say> fallback

    cache_file = _cache_path(text)
    if cache_file.exists():
        return f"/audio/{cache_file.name}"

    try:
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        audio_stream = client.text_to_speech.convert(
            voice_id=settings.elevenlabs_voice_id,
            text=text,
            model_id="eleven_turbo_v2",
        )
        Path(settings.audio_cache_dir).mkdir(parents=True, exist_ok=True)
        with open(cache_file, "wb") as f:
            for chunk in audio_stream:
                f.write(chunk)
        logger.info(f"TTS cached: {cache_file.name}")
    except Exception as exc:
        logger.error(f"ElevenLabs TTS failed: {exc} — falling back to Twilio <Say>")
        return ""  # empty string signals caller to use <Say> fallback

    return f"/audio/{cache_file.name}"
