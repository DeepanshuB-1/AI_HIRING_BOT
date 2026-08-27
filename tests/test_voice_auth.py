"""POST /voice/initiate/{id} must require HR auth and enforce tenant ownership."""
import uuid
from unittest.mock import MagicMock

import pytest


class FakeCandidate:
    def __init__(self, hr_user_id, consent_given=True):
        self.id = uuid.uuid4()
        self.hr_user_id = hr_user_id
        self.consent_given = consent_given
        self.name = "Candidate X"
        self.email = "candidate@example.com"
        self.phone = "+10000000000"
        self.status = "analyzed"
        self.questions_json = [{"question": "Tell me about yourself"}]
        self.jd_id = uuid.uuid4()


def test_initiate_requires_authentication(client):
    """Unauthenticated callers get 401 — never a call placed."""
    resp = client.post(f"/voice/initiate/{uuid.uuid4()}")
    assert resp.status_code == 401


def test_initiate_rejects_other_tenants_candidate(auth_client, db, other_hr_user):
    """
    A candidate owned by another HR user must look non-existent (404), not 403,
    so ownership is never disclosed.
    """
    db.get.return_value = FakeCandidate(hr_user_id=other_hr_user.id)

    resp = auth_client.post(f"/voice/initiate/{uuid.uuid4()}")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Candidate not found"


def test_initiate_rejects_missing_candidate(auth_client, db):
    db.get.return_value = None
    resp = auth_client.post(f"/voice/initiate/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_initiate_does_not_dial_for_other_tenant(auth_client, db, other_hr_user, monkeypatch):
    """The Twilio client must never be reached on a cross-tenant attempt."""
    dialer = MagicMock(return_value="CAfake")
    monkeypatch.setattr("backend.routers.voice.initiate_call", dialer)
    db.get.return_value = FakeCandidate(hr_user_id=other_hr_user.id)

    resp = auth_client.post(f"/voice/initiate/{uuid.uuid4()}")

    assert resp.status_code == 404
    dialer.assert_not_called()
