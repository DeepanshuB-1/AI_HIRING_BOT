import redis
from .config import settings

r = redis.Redis.from_url(
    settings.redis_url,
    db=0,
    decode_responses=True,
)


def get_redis() -> redis.Redis:
    return r


def ping_redis() -> bool:
    try:
        return r.ping()
    except Exception:
        return False
