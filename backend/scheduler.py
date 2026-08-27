import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from backend.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
IST = ZoneInfo("Asia/Kolkata")

# Guards against add_job/start being called twice inside one process (e.g. a double
# lifespan invocation under --reload), which would double every scheduled job.
_scheduler_started = False


@asynccontextmanager
async def _job_lock(name: str, ttl_seconds: int = 55):
    """
    Best-effort distributed lock so that only one process runs a given scheduled job,
    even if several app instances are deployed.

    Uses a Redis SET NX EX key. Failure-safe by design: if Redis is unreachable we log
    and still run the job — a missed call is worse than a rare duplicate, and the
    single-instance deployment note below remains the real guarantee.
    Yields True when the job should run, False when another instance holds the lock.
    """
    key = f"scheduler:lock:{name}"
    token = uuid4().hex
    acquired = False
    client = None
    try:
        from backend.redis_client import get_redis
        client = get_redis()
        acquired = bool(client.set(key, token, nx=True, ex=ttl_seconds))
        if not acquired:
            logger.debug("[scheduler] %s skipped — lock held by another instance", name)
        yield acquired
    except Exception as exc:
        logger.warning("[scheduler] lock unavailable for %s (%s) — running unlocked", name, exc)
        yield True
        return
    finally:
        # Only release a lock we still own, so a slow job cannot delete a successor's lock.
        if acquired and client is not None:
            try:
                if client.get(key) in (token, token.encode()):
                    client.delete(key)
            except Exception as exc:
                logger.debug("[scheduler] could not release lock %s: %s", name, exc)


async def fire_scheduled_calls():
    """
    Every minute: fire any ScreeningCall whose scheduled_date/time matches right now (IST).
    Respects max_concurrent_calls so the GPU is never overloaded.
    """
    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.candidate import Candidate, CandidateStatus
    from backend.models.call import ScreeningCall, CallStatus
    from backend.voice.twilio_client import initiate_call

    now = datetime.now(IST)
    today = now.date()
    current_hour = now.hour
    current_minute = now.minute

    if not (settings.call_window_start <= current_hour < settings.call_window_end):
        return

    async with _job_lock("fire_scheduled_calls") as acquired:
        if not acquired:
            return
        await _fire_due_calls(now, current_hour, current_minute)


async def _fire_due_calls(now: datetime, current_hour: int, current_minute: int) -> None:
    """Body of fire_scheduled_calls, run only while holding the distributed lock."""
    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.candidate import Candidate, CandidateStatus
    from backend.models.call import ScreeningCall, CallStatus
    from backend.voice.twilio_client import initiate_call

    today = now.date()

    async with AsyncSessionLocal() as db:
        # How many calls are currently live?
        active_result = await db.execute(
            select(ScreeningCall).where(
                ScreeningCall.status.in_([CallStatus.dialing, CallStatus.in_progress])
            )
        )
        active_count = len(active_result.scalars().all())
        if active_count >= settings.max_concurrent_calls:
            logger.debug(f"[scheduler] {active_count} call(s) active — at capacity, skipping")
            return

        # Find pending calls scheduled for this exact minute
        due_result = await db.execute(
            select(ScreeningCall).where(
                and_(
                    ScreeningCall.scheduled_date == today,
                    ScreeningCall.status == CallStatus.pending,
                )
            )
        )
        all_pending_today = due_result.scalars().all()

        # Fire calls scheduled for right now OR overdue by up to 30 minutes
        # (catches server restarts / laptop-sleep gaps)
        grace_cutoff = (now - timedelta(minutes=30)).time()
        due_calls = [
            c for c in all_pending_today
            if c.scheduled_time
            and grace_cutoff <= c.scheduled_time <= now.time()
        ]

        for call in due_calls:
            candidate = await db.get(Candidate, call.candidate_id)
            if not candidate:
                continue

            try:
                call_sid = initiate_call(
                    to_phone=candidate.phone,
                    candidate_id=str(candidate.id),
                    jd_id=str(candidate.jd_id),
                )
                call.twilio_call_sid = call_sid
                call.status = CallStatus.dialing
                candidate.status = CandidateStatus.in_call
                await db.commit()
                logger.info(
                    f"[scheduler] Fired scheduled call for {candidate.name} "
                    f"at {current_hour:02d}:{current_minute:02d} IST → {call_sid}"
                )
            except Exception as exc:
                await db.rollback()
                logger.error(f"[scheduler] Failed to fire call for {candidate.name}: {exc}")


async def cleanup_stuck_calls():
    """
    Every 5 minutes: reset any call stuck in dialing/in_progress for >15 min.
    Happens when Twilio status webhook never fires (TTS failure, network drop, etc.)
    """
    from sqlalchemy import select
    from backend.database import AsyncSessionLocal
    from backend.models.candidate import Candidate, CandidateStatus
    from backend.models.call import ScreeningCall, CallStatus

    now = datetime.now(IST)
    cutoff = now - timedelta(minutes=15)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScreeningCall).where(
                ScreeningCall.status.in_([CallStatus.dialing, CallStatus.in_progress])
            )
        )
        stuck = [
            c for c in result.scalars().all()
            if (c.call_started_at or c.created_at) < cutoff.replace(tzinfo=None)
        ]

        for call in stuck:
            call.status = CallStatus.failed
            candidate = await db.get(Candidate, call.candidate_id)
            if candidate and candidate.status == CandidateStatus.in_call:
                candidate.status = CandidateStatus.scheduled
            logger.warning(
                f"[scheduler] Cleaned up stuck call {call.id} "
                f"(was {call.status.value}) — candidate reset to scheduled"
            )

        if stuck:
            await db.commit()


async def send_precall_reminders():
    """
    Every 5 minutes: send a reminder SMS to candidates whose interview is 25-35 minutes away.
    Window of 25-35 min means we fire once per slot even if the job runs slightly late.
    """
    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.call import ScreeningCall, CallStatus
    from backend.models.candidate import Candidate
    from backend.tasks import send_sms_task

    now = datetime.now(IST)
    today = now.date()

    async with _job_lock("send_precall_reminders") as acquired:
        if not acquired:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ScreeningCall).where(
                    and_(
                        ScreeningCall.scheduled_date == today,
                        ScreeningCall.status == CallStatus.pending,
                        # One reminder per call, ever.
                        ScreeningCall.reminder_sent_at.is_(None),
                    )
                )
            )
            sent = 0
            for call in result.scalars().all():
                if not call.scheduled_time:
                    continue
                call_dt = datetime(today.year, today.month, today.day,
                                   call.scheduled_time.hour, call.scheduled_time.minute, tzinfo=IST)
                minutes_until = (call_dt - now).total_seconds() / 60
                if not (25 <= minutes_until <= 35):
                    continue

                candidate = await db.get(Candidate, call.candidate_id)
                if not candidate or not candidate.phone:
                    continue

                msg = (
                    f"Hi {candidate.name.split()[0]}, just a reminder: "
                    f"your AI interview is in about 30 minutes "
                    f"({call.scheduled_time.strftime('%H:%M')} IST). "
                    f"Please be in a quiet place with good phone signal. Good luck!"
                )
                try:
                    send_sms_task.delay(candidate.phone, msg)
                except Exception as exc:
                    # Leave reminder_sent_at NULL so the next tick retries this call.
                    logger.error(
                        "[scheduler] Failed to queue reminder for %s: %s", candidate.name, exc
                    )
                    continue

                # Mark sent only after the SMS task was successfully queued.
                call.reminder_sent_at = datetime.utcnow()
                sent += 1
                logger.info(f"[scheduler] Sent pre-call reminder to {candidate.name}")

            if sent:
                await db.commit()


async def warn_upcoming_calls():
    """
    Every 30 minutes: log upcoming scheduled calls in the next 2 hours for visibility.
    """
    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.call import ScreeningCall, CallStatus
    from backend.models.candidate import Candidate

    now = datetime.now(IST)
    today = now.date()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScreeningCall).where(
                and_(
                    ScreeningCall.scheduled_date == today,
                    ScreeningCall.status == CallStatus.pending,
                )
            )
        )
        upcoming = [
            c for c in result.scalars().all()
            if c.scheduled_time
            and c.scheduled_time >= now.time()
            and c.scheduled_time.hour < now.hour + 2
        ]

        for c in upcoming:
            candidate = await db.get(Candidate, c.candidate_id)
            name = candidate.name if candidate else "unknown"
            logger.info(
                f"[scheduler] Upcoming: {name} at "
                f"{c.scheduled_time.strftime('%H:%M')} IST"
            )


async def send_daily_job_alerts():
    """
    Daily at 08:00 IST: email new job listings to candidates who opted in.
    Sends jobs posted in the last 25 hours so we don't miss anything.
    """
    from sqlalchemy import select
    from backend.database import AsyncSessionLocal
    from backend.models.candidate_user import CandidateUser
    from backend.models.job import Job
    from backend.notifications.email import send_email
    from backend.config import settings as cfg

    since = datetime.now(IST).replace(tzinfo=None) - timedelta(hours=25)

    async with AsyncSessionLocal() as db:
        # New active jobs
        jobs_result = await db.execute(
            select(Job).where(Job.is_active.is_(True), Job.created_at >= since).order_by(Job.created_at.desc())
        )
        new_jobs = jobs_result.scalars().all()
        if not new_jobs:
            logger.info("[job-alerts] No new jobs today — skipping digest")
            return

        # Candidates who opted in
        users_result = await db.execute(
            select(CandidateUser).where(CandidateUser.job_alerts.is_(True))
        )
        users = users_result.scalars().all()

    if not users:
        return

    def _salary(job):
        if job.salary_min:
            return f" · ₹{job.salary_min}–{job.salary_max or '?'} LPA"
        return ""

    jobs_html = "".join(
        f"""<tr>
          <td style="padding:12px 0;border-bottom:1px solid #F1F5F9">
            <a href="{cfg.frontend_url}/portal/jobs/{job.id}"
               style="font-weight:600;color:#0D9488;text-decoration:none;font-size:15px">{job.title}</a>
            <div style="color:#94A3B8;font-size:13px;margin-top:4px">
              {job.company or ''}{' · ' if job.company and job.location else ''}{job.location or ''}
              {_salary(job)}
            </div>
          </td>
        </tr>"""
        for job in new_jobs
    )

    for user in users:
        first = user.name.split()[0] if user.name else "there"
        subject = f"{len(new_jobs)} new role{'s' if len(new_jobs) != 1 else ''} posted today"
        html = f"""
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff">
          <div style="margin-bottom:24px">
            <span style="font-size:20px;font-weight:700;color:#0F172A">HiringBot</span>
          </div>
          <h2 style="color:#0F172A;font-size:20px;margin:0 0 8px">Hi {first}, here's what's new today</h2>
          <p style="color:#475569;font-size:14px;margin:0 0 24px">
            {len(new_jobs)} new position{'s' if len(new_jobs) != 1 else ''} just posted — apply in minutes.
          </p>
          <table style="width:100%;border-collapse:collapse">{jobs_html}</table>
          <a href="{cfg.frontend_url}/portal"
             style="display:inline-block;margin-top:24px;padding:12px 28px;
                    background:#0D9488;color:#fff;border-radius:999px;font-weight:600;
                    text-decoration:none;font-size:14px">
            View all open roles
          </a>
          <hr style="border:none;border-top:1px solid #F1F5F9;margin:32px 0" />
          <p style="color:#94A3B8;font-size:12px">
            You're receiving this because you enabled job alerts on your
            <a href="{cfg.frontend_url}/portal/profile" style="color:#0D9488">profile</a>.
            Update preferences any time.
          </p>
        </div>"""
        send_email(user.email, subject, html)

    logger.info(f"[job-alerts] Sent digest for {len(new_jobs)} jobs to {len(users)} subscriber(s)")


def start_scheduler():
    """
    Start the APScheduler jobs.

    DEPLOYMENT NOTE: only ONE scheduler instance should run in production. Jobs that
    place calls or send reminders additionally take a short Redis lock (see _job_lock)
    so an accidental second instance cannot double-fire them, but that lock is
    best-effort — run a single web process, or set SCHEDULER_ENABLED=false on all but
    one instance.
    """
    global _scheduler_started

    if not settings.scheduler_enabled:
        logger.info("Scheduler disabled via SCHEDULER_ENABLED=false")
        return
    if _scheduler_started or scheduler.running:
        logger.warning("[scheduler] start_scheduler() called twice — ignoring second call")
        return

    # Check every minute for calls due right now
    scheduler.add_job(
        fire_scheduled_calls,
        IntervalTrigger(minutes=1),
        id="fire_scheduled_calls",
        replace_existing=True,
    )
    # Reset calls stuck in dialing/in_progress every 5 minutes
    scheduler.add_job(
        cleanup_stuck_calls,
        IntervalTrigger(minutes=5),
        id="cleanup_stuck_calls",
        replace_existing=True,
    )
    # Send reminder SMS to candidates 30 min before their interview
    scheduler.add_job(
        send_precall_reminders,
        IntervalTrigger(minutes=5),
        id="send_precall_reminders",
        replace_existing=True,
    )
    # Log upcoming calls every 30 min for visibility
    scheduler.add_job(
        warn_upcoming_calls,
        IntervalTrigger(minutes=30),
        id="warn_upcoming_calls",
        replace_existing=True,
    )

    # Daily job-alert digest at 08:00 IST
    scheduler.add_job(
        send_daily_job_alerts,
        CronTrigger(hour=9, minute=0, timezone="Asia/Kolkata"),
        id="send_daily_job_alerts",
        replace_existing=True,
    )

    scheduler.start()
    _scheduler_started = True
    logger.info(
        f"[scheduler] Started — time-based mode, fires at exact scheduled minute, "
        f"call window {settings.call_window_start}:00–{settings.call_window_end}:00 IST, "
        f"max {settings.max_concurrent_calls} concurrent call(s)"
    )


def stop_scheduler():
    global _scheduler_started
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[scheduler] Stopped")
    _scheduler_started = False
