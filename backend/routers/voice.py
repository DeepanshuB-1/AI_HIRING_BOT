import uuid
import logging
import html
from datetime import datetime
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.config import settings
from backend.models.candidate import Candidate, CandidateStatus
from backend.models.call import ScreeningCall, CallStatus
from backend.models.job import Job
from backend.voice.call_state import init_state, get_state, update_state, append_transcript
from backend.voice.tts import synthesize
from backend.voice.twilio_client import initiate_call
from backend.services.interview_engine import generate_opening, generate_next_response
from backend.tasks import run_report_gen, send_sms_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["Voice"])


def _twiml(content: str) -> Response:
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{content}</Response>',
        media_type="application/xml",
    )


def _play_or_say(text: str) -> str:
    """Return TwiML play+gather block. Falls back to <Say> if ElevenLabs TTS fails."""
    audio_path = synthesize(text)
    if audio_path:
        play_block = f'<Play>{settings.webhook_base_url}{audio_path}</Play>'
    else:
        safe = html.escape(text)
        play_block = f'<Say voice="alice" language="en-IN">{safe}</Say>'
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    gather = (
        f'<Gather input="speech" action="{respond_url}" '
        f'method="POST" speechTimeout="auto" language="en-IN" timeout="10">'
        f'</Gather>'
        f'<Redirect method="POST">{respond_url}</Redirect>'
    )
    return play_block + gather


# ── Consent endpoint (candidate clicks link from SMS) ─────────────────────────

@router.get("/consent/{candidate_id}")
async def candidate_consent(candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Candidate clicks this link from the SMS to give consent before the call."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Invalid consent link")
    if candidate.consent_given:
        return {"message": f"Consent already recorded for {candidate.name}. You will receive a call shortly."}
    candidate.consent_given = True
    candidate.consent_at = datetime.utcnow()
    await db.commit()
    return {
        "message": (
            f"Thank you {candidate.name}! Your consent has been recorded. "
            "You will receive a screening call shortly. Please keep your phone nearby."
        )
    }


# ── Manual call trigger (HR dashboard / scheduler) ───────────────────────────

@router.post("/initiate/{candidate_id}")
async def initiate_screening(candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    Trigger an outbound call for a candidate.
    Used by HR dashboard and Phase 4 APScheduler.
    """
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not candidate.consent_given:
        raise HTTPException(status_code=403, detail="Candidate has not given consent yet")
    if candidate.status not in (CandidateStatus.analyzed, CandidateStatus.pending_review):
        raise HTTPException(
            status_code=400,
            detail=f"Candidate not ready for call. Current status: {candidate.status}",
        )
    if not candidate.questions_json:
        raise HTTPException(status_code=400, detail="No questions generated yet — pipeline still running")

    call_record = ScreeningCall(candidate_id=candidate.id, status=CallStatus.dialing)
    db.add(call_record)
    await db.flush()

    try:
        call_sid = initiate_call(
            to_phone=candidate.phone,
            candidate_id=str(candidate.id),
            jd_id=str(candidate.jd_id),
        )
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Twilio error: {exc}")

    call_record.twilio_call_sid = call_sid
    candidate.status = CandidateStatus.scheduled
    await db.commit()

    # Notify candidate via email that call is coming
    from backend.tasks import send_email_task
    from backend.notifications.templates import interview_invite_email_html
    job = await db.get(Job, candidate.jd_id)
    role = job.title if job else "the applied role"
    subject, html_body = interview_invite_email_html(candidate.name, role, settings.company_name)
    send_email_task.delay(candidate.email, subject, html_body)

    return {"call_sid": call_sid, "call_id": str(call_record.id), "status": "initiated"}


# ── Twilio webhooks ───────────────────────────────────────────────────────────

@router.post("/start")
async def voice_start(
    CallSid: str = Form(...),
    candidate_id: str = Query(...),
    jd_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Twilio calls this when the candidate answers.
    Initialises call state in Redis and plays the opening statement.
    """
    candidate = await db.get(Candidate, uuid.UUID(candidate_id))
    if not candidate:
        return _twiml("<Say>Sorry, there was a system error. Goodbye.</Say><Hangup/>")

    # update ScreeningCall record
    result = await db.execute(
        select(ScreeningCall).where(ScreeningCall.twilio_call_sid == CallSid)
    )
    call = result.scalar_one_or_none()
    if call:
        call.call_started_at = datetime.utcnow()
        call.status = CallStatus.in_progress

    candidate.status = CandidateStatus.in_call

    job = await db.get(Job, candidate.jd_id)
    role = job.title if job else "this position"
    await db.commit()

    questions = candidate.questions_json or []

    init_state(CallSid, {
        "call_id": str(call.id) if call else None,
        "candidate_id": candidate_id,
        "candidate_name": candidate.name,
        "role": role,
        "questions": questions,
        "question_index": 0,
        "transcript": [],
    })

    opening_text = generate_opening(candidate.name, role)
    append_transcript(CallSid, "ai", opening_text)
    return _twiml(_play_or_say(opening_text))


@router.post("/respond")
async def voice_respond(
    CallSid: str = Form(...),
    SpeechResult: str = Form(default=""),
):
    """
    Twilio calls this after each speech input from the candidate.
    Generates the next AI response and returns TwiML.
    """
    state = get_state(CallSid)
    if not state:
        return _twiml("<Say>Your session has expired. Thank you for your time. Goodbye.</Say><Hangup/>")

    # record candidate answer and advance question index
    if SpeechResult.strip():
        append_transcript(CallSid, "candidate", SpeechResult.strip())
        current_index = state.get("question_index", 0)
        update_state(CallSid, {"question_index": current_index + 1})
        state = get_state(CallSid)

    response_text, is_closing = generate_next_response(state)
    append_transcript(CallSid, "ai", response_text)

    if is_closing:
        audio_path = synthesize(response_text)
        play_block = (
            f'<Play>{settings.webhook_base_url}{audio_path}</Play>'
            if audio_path
            else f'<Say voice="alice" language="en-IN">{html.escape(response_text)}</Say>'
        )
        run_report_gen.delay(CallSid)
        return _twiml(play_block + "<Hangup/>")

    return _twiml(_play_or_say(response_text))


@router.post("/status")
async def voice_status(
    CallSid: str = Form(...),
    call_status_raw: str = Form(..., alias="CallStatus"),
    CallDuration: str = Form(default="0"),
    db: AsyncSession = Depends(get_db),
):
    """
    Twilio status callback — fires when a call ends for any reason.
    Updates ScreeningCall record and handles retry logic.
    """
    result = await db.execute(
        select(ScreeningCall).where(ScreeningCall.twilio_call_sid == CallSid)
    )
    call = result.scalar_one_or_none()
    if not call:
        return {"ok": True}

    call.call_ended_at = datetime.utcnow()
    call.duration_seconds = int(CallDuration or 0)

    # save transcript from Redis to DB before state expires
    state = get_state(CallSid)
    if state and state.get("transcript"):
        call.transcript = state["transcript"]

    status_lower = call_status_raw.lower()
    if status_lower == "completed":
        call.status = CallStatus.completed
    elif status_lower in ("no-answer", "busy"):
        call.status = CallStatus.no_answer
    else:
        call.status = CallStatus.failed

    # retry logic for no-answer / busy
    candidate = await db.get(Candidate, call.candidate_id)
    if candidate and call.status == CallStatus.no_answer:
        if call.retry_count < settings.call_retry_count:
            call.retry_count += 1
            candidate.status = CandidateStatus.analyzed  # APScheduler will retry
        else:
            candidate.status = CandidateStatus.rejected
            send_sms_task.delay(
                candidate.phone,
                f"Hi {candidate.name}, we were unable to reach you for your screening interview with us. "
                "Please contact HR to reschedule.",
            )

    await db.commit()
    return {"ok": True}
