import logging
from backend.config import settings

logger = logging.getLogger(__name__)


def send_sms(to_phone: str, message: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=message,
            from_=settings.twilio_phone_number,
            to=to_phone,
        )
        return True
    except Exception as exc:
        logger.error(f"SMS send failed to {to_phone}: {exc}")
        return False
