import logging
from backend.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    if not to_email or not to_email.strip():
        logger.warning("send_email called with empty address — skipping")
        return False
    if not settings.sendgrid_api_key or settings.sendgrid_api_key == "your_sendgrid_key":
        logger.warning("SendGrid API key not configured — email not sent")
        return False
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=settings.from_email,
            to_emails=to_email,
            subject=subject,
            html_content=html_content,
        )
        sg = SendGridAPIClient(settings.sendgrid_api_key)
        response = sg.send(message)
        logger.info(f"Email sent to {to_email} — status {response.status_code}")
        return response.status_code in (200, 201, 202)
    except Exception as exc:
        logger.error(f"Email send failed to {to_email}: {exc}")
        return False
