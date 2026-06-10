import logging
import asyncio
from backend.config import settings

logger = logging.getLogger(__name__)


def _transcribe_sync(audio_bytes: bytes) -> str:
    """Transcribe audio bytes with Deepgram nova-2-phonecall (sync, run in thread)."""
    from deepgram import DeepgramClient, PrerecordedOptions

    client = DeepgramClient(settings.deepgram_api_key)
    options = PrerecordedOptions(
        model="nova-2-phonecall",
        language="en-US",
        smart_format=True,
        punctuate=True,
        filler_words=False,   # strip um/uh automatically
        utterances=False,
    )
    response = client.listen.prerecorded.v("1").transcribe_file(
        {"buffer": audio_bytes, "mimetype": "audio/wav"},
        options,
    )
    channels = response.get("results", {}).get("channels", [])
    if not channels:
        return ""
    alts = channels[0].get("alternatives", [])
    if not alts:
        return ""
    return (alts[0].get("transcript") or "").strip()


async def transcribe_recording(recording_url: str) -> str:
    """
    Download Twilio recording (requires Basic Auth) and transcribe via Deepgram.
    Returns transcript string, or "" on any failure.
    """
    if not settings.deepgram_api_key:
        logger.warning("Deepgram API key not set — skipping transcription")
        return ""
    if not recording_url:
        return ""

    try:
        import httpx
        # Twilio recordings require Basic Auth with account SID + auth token
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                recording_url,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                follow_redirects=True,
            )
        if resp.status_code != 200:
            logger.error(f"[deepgram] Failed to download recording: HTTP {resp.status_code}")
            return ""

        audio_bytes = resp.content
        if len(audio_bytes) < 1000:
            return ""  # too short — silence / noise

        # Run sync Deepgram call in a thread so it doesn't block the event loop
        transcript = await asyncio.to_thread(_transcribe_sync, audio_bytes)
        logger.info(f"[deepgram] Transcript: {transcript[:120]!r}")
        return transcript

    except Exception as exc:
        logger.error(f"[deepgram] Transcription error: {exc}")
        return ""
