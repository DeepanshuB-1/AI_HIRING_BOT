"""
Pre-call reminders must be sent at most once per ScreeningCall.

The scheduler runs every 5 minutes and the reminder window is 25-35 minutes wide,
so without persistent state the same candidate would be texted 2-3 times.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.scheduler import IST, send_precall_reminders


class FakeCall:
    def __init__(self, scheduled_time, reminder_sent_at=None):
        self.id = uuid.uuid4()
        self.candidate_id = uuid.uuid4()
        self.scheduled_time = scheduled_time
        self.scheduled_date = datetime.now(IST).date()
        self.status = "pending"
        self.reminder_sent_at = reminder_sent_at


class FakeCandidate:
    def __init__(self):
        self.id = uuid.uuid4()
        self.name = "Test Candidate"
        self.phone = "+10000000000"


def _install(monkeypatch, calls, sms_task):
    """Point the scheduler at a fake DB session and a fake SMS task."""
    session = AsyncMock()
    result = MagicMock()

    def _query(_stmt):
        # Emulate the SQL filter `reminder_sent_at IS NULL`.
        result.scalars.return_value.all.return_value = [
            c for c in calls if c.reminder_sent_at is None
        ]
        return result

    session.execute = AsyncMock(side_effect=_query)
    session.get = AsyncMock(return_value=FakeCandidate())
    session.commit = AsyncMock()

    @asynccontextmanager
    async def _session_factory():
        yield session

    monkeypatch.setattr("backend.database.AsyncSessionLocal", _session_factory)
    # backend.tasks is a stub module injected in conftest; patch the object directly
    # because it is not bound as an attribute of the `backend` package.
    import backend.tasks as _tasks
    monkeypatch.setattr(_tasks, "send_sms_task", sms_task, raising=False)

    # Lock is exercised separately; always grant it here.
    @asynccontextmanager
    async def _lock(_name, ttl_seconds: int = 55):
        yield True

    monkeypatch.setattr("backend.scheduler._job_lock", _lock)
    return session


@pytest.mark.asyncio
async def test_reminder_sent_once_then_never_again(monkeypatch):
    """Two scheduler ticks over the same window must produce exactly one SMS."""
    due = (datetime.now(IST) + timedelta(minutes=30)).time()
    call = FakeCall(scheduled_time=due)
    sms = MagicMock()
    sms.delay = MagicMock()
    session = _install(monkeypatch, [call], sms)

    await send_precall_reminders()
    assert sms.delay.call_count == 1
    assert call.reminder_sent_at is not None, "call must be marked as reminded"

    # Second tick, 5 minutes later — still inside the 25-35 min window.
    await send_precall_reminders()
    assert sms.delay.call_count == 1, "a second reminder must not be sent"


@pytest.mark.asyncio
async def test_already_reminded_call_is_skipped(monkeypatch):
    due = (datetime.now(IST) + timedelta(minutes=30)).time()
    call = FakeCall(scheduled_time=due, reminder_sent_at=datetime.utcnow())
    sms = MagicMock()
    sms.delay = MagicMock()
    _install(monkeypatch, [call], sms)

    await send_precall_reminders()

    sms.delay.assert_not_called()


@pytest.mark.asyncio
async def test_call_outside_window_is_not_reminded(monkeypatch):
    due = (datetime.now(IST) + timedelta(minutes=120)).time()
    call = FakeCall(scheduled_time=due)
    sms = MagicMock()
    sms.delay = MagicMock()
    _install(monkeypatch, [call], sms)

    await send_precall_reminders()

    sms.delay.assert_not_called()
    assert call.reminder_sent_at is None


@pytest.mark.asyncio
async def test_failed_sms_queue_leaves_call_retryable(monkeypatch):
    """If queueing the SMS raises, the call must stay eligible for the next tick."""
    due = (datetime.now(IST) + timedelta(minutes=30)).time()
    call = FakeCall(scheduled_time=due)
    sms = MagicMock()
    sms.delay = MagicMock(side_effect=RuntimeError("broker down"))
    _install(monkeypatch, [call], sms)

    await send_precall_reminders()

    assert call.reminder_sent_at is None, "must remain retryable after a queue failure"
