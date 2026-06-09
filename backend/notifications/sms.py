import logging
from backend.config import settings

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str) -> str:
    """Ensure phone is in E.164 format. Adds +91 for bare 10-digit Indian numbers."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        return phone
    if len(phone) == 10:
        return f"+91{phone}"
    if phone.startswith("91") and len(phone) == 12:
        return f"+{phone}"
    return phone


def send_sms(to_phone: str, message: str) -> bool:
    if not to_phone or not to_phone.strip():
        logger.warning("send_sms called with empty phone number — skipping")
        return False
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_phone_number:
        logger.warning("Twilio credentials not configured — SMS not sent")
        return False
    # Twilio trial prepends ~38-char prefix; hard-cap at 120 chars to stay in 1 segment
    if len(message) > 120:
        logger.error(f"SMS message too long ({len(message)} chars) — blocked before sending: {message[:80]}...")
        return False
    logger.info(f"SMS to {to_phone} ({len(message)} chars): {message}")
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        normalized = _normalize_phone(to_phone)
        client.messages.create(
            body=message,
            from_=settings.twilio_phone_number,
            to=normalized,
        )
        logger.info(f"SMS sent to {normalized}")
        return True
    except Exception as exc:
        logger.error(f"SMS send failed to {to_phone}: {exc}")
        return False
