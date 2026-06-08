import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


async def auto_schedule_calls():
    """
    Every N minutes: find analyzed/pending_review candidates with consent given
    and no active call — initiate outbound calls automatically.
    Only runs inside the configured call window (default 09:00–18:00 IST).
    """
    now = datetime.now()
    if not (settings.call_window_start <= now.hour < settings.call_window_end):
        logger.debug("Outside call window — skipping auto-schedule")
        return

    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.candidate import Candidate, CandidateStatus
    from backend.models.call import ScreeningCall, CallStatus
    from backend.voice.twilio_client import initiate_call

    async with AsyncSessionLocal() as db:
        # Check how many calls are currently active — respect GPU concurrency limit
        active_count_result = await db.execute(
            select(ScreeningCall).where(
                ScreeningCall.status.in_([CallStatus.dialing, CallStatus.in_progress])
            )
        )
        active_count = len(active_count_result.scalars().all())
        slots_available = settings.max_concurrent_calls - active_count

        if slots_available <= 0:
            logger.debug(f"[scheduler] {active_count} call(s) already active — skipping (max={settings.max_concurrent_calls})")
            return

        result = await db.execute(
            select(Candidate).where(
                and_(
                    Candidate.status.in_([CandidateStatus.analyzed, CandidateStatus.pending_review]),
                    Candidate.consent_given == True,
                    Candidate.jd_id.isnot(None),
                    Candidate.questions_json.isnot(None),
                )
            ).order_by(Candidate.created_at.asc())  # FIFO — oldest applicant first
        )
        candidates = result.scalars().all()

        initiated = 0
        for candidate in candidates:
            if initiated >= slots_available:
                break  # Don't exceed GPU concurrency limit

            # Skip if this candidate already has an active/dialing call
            existing = await db.execute(
                select(ScreeningCall).where(
                    and_(
                        ScreeningCall.candidate_id == candidate.id,
                        ScreeningCall.status.in_([CallStatus.dialing, CallStatus.in_progress]),
                    )
                )
            )
            if existing.scalars().first():
                continue

            try:
                call_record = ScreeningCall(candidate_id=candidate.id, status=CallStatus.dialing)
                db.add(call_record)
                await db.flush()

                call_sid = initiate_call(
                    to_phone=candidate.phone,
                    candidate_id=str(candidate.id),
                    jd_id=str(candidate.jd_id),
                )
                call_record.twilio_call_sid = call_sid
                candidate.status = CandidateStatus.scheduled
                await db.commit()
                initiated += 1
                logger.info(f"[scheduler] Auto-initiated call for {candidate.name} → {call_sid}")

            except Exception as exc:
                await db.rollback()
                logger.error(f"[scheduler] Failed to initiate call for {candidate.name}: {exc}")


async def retry_no_answer_calls():
    """
    Every CALL_RETRY_INTERVAL_MINUTES: re-initiate calls for no_answer candidates
    who are within their retry limit and enough time has passed since last attempt.
    """
    from sqlalchemy import select, and_
    from backend.database import AsyncSessionLocal
    from backend.models.candidate import Candidate, CandidateStatus
    from backend.models.call import ScreeningCall, CallStatus
    from backend.voice.twilio_client import initiate_call
    from backend.notifications.sms import send_sms
    from backend.notifications.templates import consent_sms

    retry_gap = timedelta(minutes=settings.call_retry_interval_minutes)
    now = datetime.utcnow()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScreeningCall, Candidate)
            .join(Candidate, ScreeningCall.candidate_id == Candidate.id)
            .where(
                and_(
                    ScreeningCall.status == CallStatus.no_answer,
                    ScreeningCall.retry_count < settings.call_retry_count,
                    Candidate.consent_given == True,
                )
            )
            .order_by(ScreeningCall.call_ended_at.desc())
        )
        rows = result.all()

        seen_candidates: set = set()
        for call, candidate in rows:
            if candidate.id in seen_candidates:
                continue
            seen_candidates.add(candidate.id)

            if call.call_ended_at and (now - call.call_ended_at) < retry_gap:
                continue  # Too soon to retry

            # Check no active call already
            active = await db.execute(
                select(ScreeningCall).where(
                    and_(
                        ScreeningCall.candidate_id == candidate.id,
                        ScreeningCall.status.in_([CallStatus.dialing, CallStatus.in_progress]),
                    )
                )
            )
            if active.scalars().first():
                continue

            try:
                new_call = ScreeningCall(
                    candidate_id=candidate.id,
                    status=CallStatus.dialing,
                    retry_count=call.retry_count + 1,
                )
                db.add(new_call)
                await db.flush()

                call_sid = initiate_call(
                    to_phone=candidate.phone,
                    candidate_id=str(candidate.id),
                    jd_id=str(candidate.jd_id),
                )
                new_call.twilio_call_sid = call_sid
                candidate.status = CandidateStatus.scheduled
                await db.commit()
                logger.info(
                    f"[scheduler] Retry #{call.retry_count + 1} call for {candidate.name} → {call_sid}"
                )

            except Exception as exc:
                await db.rollback()
                logger.error(f"[scheduler] Retry failed for {candidate.name}: {exc}")


def start_scheduler():
    if not settings.scheduler_enabled:
        logger.info("Scheduler disabled via SCHEDULER_ENABLED=false")
        return

    scheduler.add_job(
        auto_schedule_calls,
        IntervalTrigger(minutes=settings.auto_schedule_interval_minutes),
        id="auto_schedule_calls",
        replace_existing=True,
    )
    scheduler.add_job(
        retry_no_answer_calls,
        IntervalTrigger(minutes=settings.call_retry_interval_minutes),
        id="retry_no_answer_calls",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"[scheduler] Started — auto-schedule every {settings.auto_schedule_interval_minutes}m, "
        f"retry every {settings.call_retry_interval_minutes}m, "
        f"call window {settings.call_window_start}:00–{settings.call_window_end}:00 IST"
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[scheduler] Stopped")
