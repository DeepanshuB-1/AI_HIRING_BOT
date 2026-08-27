"""Twilio webhook endpoints must reject unsigned/forged requests with 403."""
import pytest

from backend.security import _public_url, verify_twilio_request


TWILIO_WEBHOOKS = [
    "/voice/start",
    "/voice/respond",
    "/voice/continue",
    "/voice/continue-probe",
    "/voice/status",
    "/voice/transcribe",
]


@pytest.mark.parametrize("path", TWILIO_WEBHOOKS)
def test_webhook_rejects_missing_signature(client, monkeypatch, path):
    """With an auth token configured, a request with no signature header is 403."""
    monkeypatch.setattr("backend.security.settings.twilio_auth_token", "test_token")

    resp = client.post(path, data={"CallSid": "CAtest"})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Invalid Twilio signature"


@pytest.mark.parametrize("path", TWILIO_WEBHOOKS)
def test_webhook_rejects_bad_signature(client, monkeypatch, path):
    monkeypatch.setattr("backend.security.settings.twilio_auth_token", "test_token")

    resp = client.post(
        path,
        data={"CallSid": "CAtest"},
        headers={"X-Twilio-Signature": "obviously-not-valid"},
    )

    assert resp.status_code == 403


def test_consent_page_is_not_signature_protected(client, db):
    """Candidate-facing consent pages must stay reachable by a normal browser."""
    db.get.return_value = None  # unknown candidate -> handled by the route itself
    resp = client.get("/voice/consent/00000000-0000-0000-0000-000000000000")
    assert resp.status_code != 403


def test_public_url_uses_webhook_base_url(monkeypatch):
    """
    Behind ngrok the app sees http://testserver but Twilio signed the public HTTPS
    URL — validation must rebuild the public origin while keeping path + query.
    """
    monkeypatch.setattr(
        "backend.security.settings.webhook_base_url", "https://example.ngrok-free.app"
    )

    class _Req:
        url = "http://localhost:8000/voice/respond?x=1"

    assert _public_url(_Req()) == "https://example.ngrok-free.app/voice/respond?x=1"
