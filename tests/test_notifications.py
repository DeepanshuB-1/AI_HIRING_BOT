"""HR notifications must never cross tenant boundaries."""
import uuid
from unittest.mock import MagicMock

import pytest


class FakeNotification:
    def __init__(self, hr_user_id, read=False):
        self.id = uuid.uuid4()
        self.hr_user_id = hr_user_id
        self.type = "call_interrupted"
        self.title = "Call interrupted"
        self.message = "A call was interrupted"
        self.candidate_id = None
        self.read = read
        from datetime import datetime
        self.created_at = datetime(2026, 1, 1, 12, 0, 0)


def _result(rows=(), scalar=0):
    r = MagicMock()
    r.scalars.return_value.all.return_value = list(rows)
    r.scalar.return_value = scalar
    return r


def _where_clauses(db):
    return " ".join(str(c.args[0]) for c in db.execute.await_args_list if c.args)


def test_list_notifications_filters_by_current_user(auth_client, db, hr_user):
    db.execute.return_value = _result([FakeNotification(hr_user.id)])

    resp = auth_client.get("/hr/notifications")

    assert resp.status_code == 200
    assert "hr_user_id" in _where_clauses(db)


def test_unread_count_filters_by_current_user(auth_client, db, hr_user):
    db.execute.return_value = _result(scalar=3)

    resp = auth_client.get("/hr/notifications/unread-count")

    assert resp.status_code == 200
    assert resp.json() == {"count": 3}
    assert "hr_user_id" in _where_clauses(db)


def test_mark_read_rejects_other_tenants_notification(auth_client, db, other_hr_user):
    """Another tenant's notification must appear not to exist, and stay unread."""
    foreign = FakeNotification(other_hr_user.id, read=False)
    db.get.return_value = foreign

    resp = auth_client.post(f"/hr/notifications/{foreign.id}/read")

    assert resp.status_code == 404
    assert foreign.read is False, "another tenant's notification must not be mutated"
    db.commit.assert_not_awaited()


def test_mark_read_allows_own_notification(auth_client, db, hr_user):
    own = FakeNotification(hr_user.id, read=False)
    db.get.return_value = own

    resp = auth_client.post(f"/hr/notifications/{own.id}/read")

    assert resp.status_code == 200
    assert own.read is True


def test_mark_all_read_is_scoped(auth_client, db, hr_user):
    db.execute.return_value = _result()

    resp = auth_client.post("/hr/notifications/read-all")

    assert resp.status_code == 200
    assert "hr_user_id" in _where_clauses(db), "bulk update must be tenant-scoped"
