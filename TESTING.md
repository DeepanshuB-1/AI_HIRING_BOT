# Testing

The backend test suite runs entirely offline. Twilio, Ollama, Redis, Celery, SendGrid
and the database are all mocked, so **no API keys, no Docker, no Ollama and no network
access are required**.

## Setup

```bash
# from the project root, with your virtualenv active
pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes `requirements.txt`, so this single command installs both
runtime and test dependencies.

## Running the tests

```bash
pytest                      # whole suite
pytest -v                   # verbose, one line per test
pytest tests/test_voice_auth.py             # a single file
pytest -k "tenant"                          # tests matching a keyword
pytest --tb=short -q                        # compact failure output
```

On Windows, if `pytest` is not on your PATH:

```powershell
.\venv\Scripts\python.exe -m pytest
```

## What is covered

| File | Covers |
|---|---|
| `tests/test_voice_auth.py` | `/voice/initiate` rejects unauthenticated callers and other tenants' candidates; Twilio is never dialled on a cross-tenant attempt |
| `tests/test_twilio_signature.py` | All six Twilio webhooks return 403 on a missing/forged signature; consent pages stay public; the public URL is rebuilt correctly behind ngrok |
| `tests/test_tenant_isolation.py` | Semantic search, similar-to-hires and cluster are scoped by `hr_user_id`; candidate upload rejects another tenant's job |
| `tests/test_notifications.py` | Notification list, unread count, mark-read and mark-all-read are tenant-scoped and cannot mutate another tenant's rows |
| `tests/test_scheduler_reminders.py` | A pre-call reminder is sent at most once per `ScreeningCall`, and stays retryable if the SMS queue fails |
| `tests/test_config_hardening.py` | Production startup rejects default secrets and placeholder URLs, and error messages never echo secret values |

## How the isolation works

`tests/conftest.py` does three things before the app is imported:

1. Injects a stub `backend.tasks` module so Celery `.delay()` calls are recorded, not dispatched.
2. Replaces `create_tables`, `ping_redis`, `start_scheduler` and `_warmup_ollama` so the
   FastAPI lifespan performs no I/O.
3. Overrides the `get_db` and `get_current_user` dependencies, giving each test a mock
   session and a fake HR user.

Two fixtures matter most:

- `auth_client` — a `TestClient` authenticated as `hr_user`
- `client` — a `TestClient` with **no** authenticated user, for testing 401s

## Frontend build check

```bash
cd frontend
npm ci
npm run build
```

## Continuous integration

`.github/workflows/ci.yml` runs the backend test suite and the frontend production
build on every push and pull request to `main`.
