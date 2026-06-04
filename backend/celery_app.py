from celery import Celery
from .config import settings

celery = Celery(
    "hiring_bot",
    broker=settings.redis_url + "/0",
    backend=settings.redis_url + "/1",
    include=["backend.tasks"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,  # one task at a time per worker (GPU safety)
)

celery.conf.task_routes = {
    "backend.tasks.run_profile_extraction": {"queue": "analysis_queue"},
    "backend.tasks.run_jd_scoring": {"queue": "analysis_queue"},
    "backend.tasks.run_question_gen": {"queue": "analysis_queue"},
    "backend.tasks.run_report_gen": {"queue": "analysis_queue"},
    "backend.tasks.send_email_task": {"queue": "notification_queue"},
    "backend.tasks.send_sms_task": {"queue": "notification_queue"},
}

# Start workers (run in separate terminals):
# celery -A backend.celery_app worker -Q analysis_queue -c 1 --loglevel=info
# celery -A backend.celery_app worker -Q notification_queue -c 2 --loglevel=info
# celery -A backend.celery_app flower --port=5555
