"""
Shared test fixtures.

The suite never touches a real database or any external service: Redis, Celery,
Ollama, Twilio, SendGrid and the embedder are all stubbed in ``_stub_external``
before the application is imported, and the DB session is a mock whose behaviour
each test defines. That keeps the tests runnable with no API keys and no Docker.
"""
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Deterministic, obviously-fake settings so nothing reads the developer's real .env.
import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars")
os.environ.setdefault("TWILIO_ACCOUNT_SID", "ACtest")
os.environ.setdefault("TWILIO_AUTH_TOKEN", "")  # empty => signature check skipped in dev
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5433/test")


def _stub_external() -> None:
    """Replace network-bound modules with no-op stubs before the app imports them."""
    # Celery tasks -> record calls instead of dispatching
    tasks = types.ModuleType("backend.tasks")
    for name in (
        "run_profile_extraction", "run_embedding_layer", "run_jd_scoring",
        "run_question_gen", "run_report_gen", "send_email_task", "send_sms_task",
    ):
        task = MagicMock(name=name)
        task.delay = MagicMock(name=f"{name}.delay")
        setattr(tasks, name, task)
    sys.modules["backend.tasks"] = tasks


_stub_external()

from fastapi.testclient import TestClient  # noqa: E402

import backend.main as _main  # noqa: E402
from backend.auth import get_current_user  # noqa: E402
from backend.database import get_db  # noqa: E402

# Neutralise startup side effects: the app lifespan otherwise creates tables,
# pings Redis, starts APScheduler and warms Ollama. None of that is available
# (or wanted) in tests.
_main.create_tables = AsyncMock(name="create_tables")
_main.ping_redis = MagicMock(name="ping_redis", return_value=True)
_main.start_scheduler = MagicMock(name="start_scheduler")
_main.stop_scheduler = MagicMock(name="stop_scheduler")
_main._warmup_ollama = AsyncMock(name="_warmup_ollama")

from backend.main import app  # noqa: E402


class FakeUser:
    """Stand-in for models.user.User — only the fields the routers actually read."""

    def __init__(self, user_id: uuid.UUID | None = None, name: str = "HR Tester"):
        self.id = user_id or uuid.uuid4()
        self.name = name
        self.email = f"{self.name.lower().replace(' ', '.')}@example.com"
        self.company_name = "Test Co"
        self.is_active = True


@pytest.fixture
def hr_user() -> FakeUser:
    return FakeUser(name="Alice HR")


@pytest.fixture
def other_hr_user() -> FakeUser:
    """A second tenant — used to prove cross-tenant access is refused."""
    return FakeUser(name="Bob HR")


@pytest.fixture
def db() -> AsyncMock:
    """Mock AsyncSession. Tests set .get / .execute return values as needed."""
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture
def client(db: AsyncMock):
    """TestClient with the DB overridden and NO authenticated user."""
    async def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(db: AsyncMock, hr_user: FakeUser):
    """TestClient authenticated as ``hr_user``."""
    async def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = lambda: hr_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
