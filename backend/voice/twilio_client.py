import logging
from backend.config import settings

logger = logging.getLogger(__name__)


def initiate_call(to_phone: str, candidate_id: str, jd_id: str) -> str:
    """
    Trigger an outbound Twilio call to the candidate.
    Returns Twilio call_sid.
    """
    from twilio.rest import Client
    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

    call = client.calls.create(
        to=to_phone,
        from_=settings.twilio_phone_number,
        url=f"{settings.webhook_base_url}/voice/start?candidate_id={candidate_id}&jd_id={jd_id}",
        status_callback=f"{settings.webhook_base_url}/voice/status",
        status_callback_event=["initiated", "ringing", "answered", "completed"],
        status_callback_method="POST",
        timeout=30,  # ring for 30s before marking no-answer
    )
    logger.info(f"Call initiated: {call.sid} → {to_phone}")
    return call.sid
