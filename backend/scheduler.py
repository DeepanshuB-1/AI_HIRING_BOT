import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
IST = ZoneInfo("Asia/Kolkata")


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

        due_calls = [
            c for c in all_pending_today
            if c.scheduled_time
            and c.scheduled_time.hour == current_hour
            and c.scheduled_time.minute == current_minute
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


def start_scheduler():
    if not settings.scheduler_enabled:
        logger.info("Scheduler disabled via SCHEDULER_ENABLED=false")
        return

    # Check every minute for calls due right now
    scheduler.add_job(
        fire_scheduled_calls,
        IntervalTrigger(minutes=1),
        id="fire_scheduled_calls",
        replace_existing=True,
    )
    # Log upcoming calls every 30 min for visibility
    scheduler.add_job(
        warn_upcoming_calls,
        IntervalTrigger(minutes=30),
        id="warn_upcoming_calls",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        f"[scheduler] Started — time-based mode, fires at exact scheduled minute, "
        f"call window {settings.call_window_start}:00–{settings.call_window_end}:00 IST, "
        f"max {settings.max_concurrent_calls} concurrent call(s)"
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[scheduler] Stopped")
