import json
from backend.redis_client import get_redis

_TTL = 7200  # 2 hours — long enough for any interview


def init_state(call_sid: str, data: dict):
    get_redis().setex(f"call:{call_sid}", _TTL, json.dumps(data))


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
