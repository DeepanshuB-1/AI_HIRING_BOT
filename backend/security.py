"""
Twilio webhook request signature validation.

Twilio signs every webhook request with HMAC-SHA1 over the full request URL plus the
POST body parameters, using the account's auth token as the key. Validating that
signature is what stops an attacker from POSTing forged call events to these public
endpoints (they are reachable by anyone who knows the ngrok/production URL).

Only mount this on endpoints Twilio itself calls. HR dashboard routes and the candidate
consent pages are browser-facing and must NOT use it.
"""
import logging
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException, Request, status
from twilio.request_validator import RequestValidator

from backend.config import settings

logger = logging.getLogger(__name__)


def _public_url(request: Request) -> str:
    """
    Rebuild the URL exactly as Twilio saw it when it signed the request.

    Behind ngrok / a reverse proxy the app sees an internal scheme+host
    (http://localhost:8000) while Twilio signed the public one
    (https://xxxx.ngrok-free.app). Twilio's HMAC covers the full URL, so we must
    substitute the configured public origin while keeping the path and query string.
    """
    base = (settings.webhook_base_url or "").strip().rstrip("/")
    incoming = urlsplit(str(request.url))
    if not base:
        return str(request.url)
    public = urlsplit(base)
    return urlunsplit((public.scheme, public.netloc, incoming.path, incoming.query, ""))


async def verify_twilio_request(request: Request) -> None:
    """
    FastAPI dependency: reject any request that is not a genuine, correctly signed
    Twilio webhook with HTTP 403.

    Validation is skipped only when no auth token is configured AND we are not in
    production — this keeps local development runnable without Twilio credentials
    while guaranteeing production always enforces signatures.
    """
    auth_token = (settings.twilio_auth_token or "").strip()

    if not auth_token:
        if settings.is_production:
            logger.error("Twilio webhook rejected: TWILIO_AUTH_TOKEN is not configured")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Webhook signature validation is not configured",
            )
        logger.warning(
            "Twilio signature validation skipped for %s — no TWILIO_AUTH_TOKEN set "
            "(development only)",
            request.url.path,
        )
        return

    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        logger.warning("Twilio webhook rejected: missing X-Twilio-Signature on %s", request.url.path)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature")

    # Twilio signs the POST form body; reading it here is safe because FastAPI caches
    # the parsed form so the endpoint's own Form(...) parameters still resolve.
    try:
        form = await request.form()
        params = {key: str(value) for key, value in form.items()}
    except Exception:
        params = {}

    validator = RequestValidator(auth_token)
    if not validator.validate(_public_url(request), params, signature):
        logger.warning("Twilio webhook rejected: bad signature on %s", request.url.path)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature")
