import json
import time
from backend.redis_client import get_redis

_TTL = 7200  # 2 hours — long enough for any interview
_ACTIVE_CALL_KEY = "active_call"
_ACTIVE_CALL_TTL = 45 * 60  # 45 minutes


def init_state(call_sid: str, data: dict):
    state = {**data, "started_at": time.time()}
    get_redis().setex(f"call:{call_sid}", _TTL, json.dumps(state))


def get_state(call_sid: str) -> dict | None:
    raw = get_redis().get(f"call:{call_sid}")
    return json.loads(raw) if raw else None


def update_state(call_sid: str, updates: dict):
    state = get_state(call_sid) or {}
    state.update(updates)
    get_redis().setex(f"call:{call_sid}", _TTL, json.dumps(state))


def append_transcript(call_sid: str, role: str, text: str):
    state = get_state(call_sid) or {}
    transcript = state.get("transcript", [])
    transcript.append({"role": role, "text": text})
    state["transcript"] = transcript
    get_redis().setex(f"call:{call_sid}", _TTL, json.dumps(state))


def delete_state(call_sid: str):
    get_redis().delete(f"call:{call_sid}")


def set_active_call(call_sid: str):
    """Mark a call as in-progress so GPU-bound analysis tasks pause."""
    get_redis().setex(_ACTIVE_CALL_KEY, _ACTIVE_CALL_TTL, call_sid)


def clear_active_call():
    """Clear the active-call flag once the call ends."""
    get_redis().delete(_ACTIVE_CALL_KEY)


def is_call_active() -> bool:
    """Return True if a voice call is currently in progress."""
    return bool(get_redis().exists(_ACTIVE_CALL_KEY))
