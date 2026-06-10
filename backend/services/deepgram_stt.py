"""
STT service — faster-whisper (local, no API key required).
Primary: faster-whisper medium model running on GPU/CPU.
Fallback: Deepgram nova-2-phonecall (if DEEPGRAM_API_KEY is set and faster-whisper fails).
"""
import asyncio
import logging
import tempfile
import os
from backend.config import settings

logger = logging.getLogger(__name__)

# Lazy-loaded Whisper model — loads on first call, stays in memory after that
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    from faster_whisper import WhisperModel
    import torch

    model_size = settings.whisper_model_size
    if torch.cuda.is_available():
        device, compute = "cuda", "float16"
        logger.info(f"[whisper] Loading {model_size} on GPU (float16)")
    else:
        device, compute = "cpu", "int8"
        logger.info(f"[whisper] Loading {model_size} on CPU (int8) — first load may take 30s")

    _whisper_model = WhisperModel(model_size, device=device, compute_type=compute)
    logger.info(f"[whisper] Model ready")
    return _whisper_model


def _transcribe_whisper(audio_bytes: bytes) -> str:
    """Transcribe raw audio bytes via faster-whisper. Saves to temp file, cleans up after."""
    model = _get_whisper_model()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            beam_size=5,
            language="en",
            vad_filter=True,              # skip silent segments automatically
            vad_parameters={"min_silence_duration_ms": 500},
        )
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        logger.info(f"[whisper] lang={info.language} prob={info.language_probability:.2f} → {transcript[:120]!r}")
        return transcript
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _transcribe_deepgram(audio_bytes: bytes) -> str:
    """Fallback: Deepgram nova-2-phonecall (only used if faster-whisper fails)."""
    if not settings.deepgram_api_key or settings.deepgram_api_key == "your_deepgram_key":
        return ""
    try:
        from deepgram import DeepgramClient, PrerecordedOptions
        client = DeepgramClient(settings.deepgram_api_key)
        options = PrerecordedOptions(
            model="nova-2-phonecall", language="en-US",
            smart_format=True, punctuate=True, filler_words=False,
        )
        resp = client.listen.prerecorded.v("1").transcribe_file(
            {"buffer": audio_bytes, "mimetype": "audio/wav"}, options
        )
        channels = resp.get("results", {}).get("channels", [])
        if channels:
            alts = channels[0].get("alternatives", [])
            if alts:
                return (alts[0].get("transcript") or "").strip()
    except Exception as exc:
        logger.error(f"[deepgram] fallback failed: {exc}")
    return ""


async def transcribe_recording(recording_url: str) -> str:
    """
    Download Twilio recording and transcribe with faster-whisper.
    Falls back to Deepgram if faster-whisper raises an exception.
    Returns "" if both fail or recording is too short.
    """
    if not recording_url:
        return ""

    # Download audio from Twilio (requires Basic Auth)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(
                recording_url,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                follow_redirects=True,
            )
        if resp.status_code != 200:
            logger.error(f"[stt] Download failed: HTTP {resp.status_code}")
            return ""
        audio_bytes = resp.content
        if len(audio_bytes) < 1000:
            return ""  # silence / noise
    except Exception as exc:
        logger.error(f"[stt] Download error: {exc}")
        return ""

    # Primary: faster-whisper (local, GPU/CPU)
    try:
        transcript = await asyncio.to_thread(_transcribe_whisper, audio_bytes)
        if transcript:
            return transcript
    except Exception as exc:
        logger.error(f"[whisper] transcription error: {exc} — trying Deepgram fallback")

    # Fallback: Deepgram
    transcript = await asyncio.to_thread(_transcribe_deepgram, audio_bytes)
    return transcript
