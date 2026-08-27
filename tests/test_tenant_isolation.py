"""HR queries must always be scoped to the authenticated user's tenant."""
import uuid
from unittest.mock import MagicMock

import pytest


def _rows(result_rows):
    """Build a mock SQLAlchemy Result returning the given rows."""
    result = MagicMock()
    result.fetchall.return_value = result_rows
    result.fetchone.return_value = result_rows[0] if result_rows else None
    result.scalars.return_value.all.return_value = result_rows
    result.scalar.return_value = 0
    return result


def _captured_sql(db):
    """Return [(sql_text, params), ...] for every db.execute call."""
    out = []
    for call in db.execute.await_args_list or db.execute.call_args_list:
        args = call.args
        sql = str(args[0]) if args else ""
        params = args[1] if len(args) > 1 else {}
        out.append((sql, params))
    return out


class FakeJob:
    def __init__(self, hr_user_id):
        self.id = uuid.uuid4()
        self.hr_user_id = hr_user_id
        self.title = "Backend Engineer"
        self.description = "desc"


# ── semantic search ──────────────────────────────────────────────────────────

def test_semantic_search_is_tenant_filtered(auth_client, db, hr_user, monkeypatch):
    monkeypatch.setattr("backend.services.embedder.embed_text", lambda _t: [0.0] * 768)
    monkeypatch.setattr("backend.services.embedder.vec_to_str", lambda _v: "[0]")
    db.execute.return_value = _rows([])

    resp = auth_client.get("/hr/candidates/semantic-search", params={"query": "python"})

    assert resp.status_code == 200
    sql, params = _captured_sql(db)[0]
    assert "hr_user_id" in sql, "semantic search must filter by hr_user_id"
    assert params["hr_user_id"] == str(hr_user.id)
    # the user-supplied query must never be interpolated into the SQL text
    assert "python" not in sql


def test_similar_to_hires_is_tenant_filtered(auth_client, db, hr_user):
    db.execute.return_value = _rows([])

    resp = auth_client.get("/hr/candidates/similar-to-hires")

    assert resp.status_code == 200
    sql, params = _captured_sql(db)[0]
    # both the hire centroid and the returned candidates must be scoped
    assert sql.count("hr_user_id") >= 2, "centroid and results must both be scoped"
    assert params["hr_user_id"] == str(hr_user.id)


# ── cluster ──────────────────────────────────────────────────────────────────

def test_cluster_rejects_other_tenants_job(auth_client, db, other_hr_user):
    db.get.return_value = FakeJob(hr_user_id=other_hr_user.id)

    resp = auth_client.get("/hr/candidates/cluster", params={"job_id": str(uuid.uuid4())})

    assert resp.status_code == 404
    db.execute.assert_not_awaited()


def test_cluster_scopes_query_for_own_job(auth_client, db, hr_user):
    db.get.return_value = FakeJob(hr_user_id=hr_user.id)
    db.execute.return_value = _rows([])

    resp = auth_client.get("/hr/candidates/cluster", params={"job_id": str(uuid.uuid4())})

    assert resp.status_code == 200
    sql, params = _captured_sql(db)[0]
    assert "hr_user_id" in sql
    assert params["hr_user_id"] == str(hr_user.id)


# ── candidate upload ─────────────────────────────────────────────────────────

def test_upload_rejects_job_owned_by_another_tenant(auth_client, db, other_hr_user):
    db.get.return_value = FakeJob(hr_user_id=other_hr_user.id)

    resp = auth_client.post(
        "/hr/candidates/upload",
        data={
            "name": "New Person",
            "email": "new@example.com",
            "phone": "+10000000000",
            "job_id": str(uuid.uuid4()),
        },
        files={"resume": ("cv.txt", b"resume text", "text/plain")},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Job not found"
