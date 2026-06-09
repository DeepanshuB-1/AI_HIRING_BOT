import uuid
import logging
import html
from datetime import datetime, date as date_type, time as time_type, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

IST = ZoneInfo("Asia/Kolkata")

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


def _say(text: str) -> str:
    """Return a TwiML <Say> or <Play> block (no Gather)."""
    audio_path = synthesize(text)
    if audio_path:
        return f'<Play>{settings.webhook_base_url}{audio_path}</Play>'
    return f'<Say voice="alice" language="en-IN">{html.escape(text)}</Say>'


def _play_or_say(text: str, speech_timeout: str = "3", start_timeout: int = 20) -> str:
    """
    Wrap speech in a <Gather> so Twilio listens DURING + AFTER playback.
    speech_timeout: seconds of silence that signals end-of-answer (default 3s).
    start_timeout: seconds to wait for the candidate to start speaking (default 20s).
    Audio is placed INSIDE the Gather so speech during playback is captured too.
    """
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    inner = _say(text)
    return (
        f'<Gather input="speech" action="{respond_url}" method="POST" '
        f'speechTimeout="{speech_timeout}" timeout="{start_timeout}" '
        f'language="en-IN" enhanced="true">'
        f'{inner}'
        f'</Gather>'
        f'<Redirect method="POST">{respond_url}</Redirect>'
    )


def _thinking_twiml() -> str:
    """
    TwiML for when candidate asks for time to think.
    Uses <Pause> between <Say> blocks so every ~12s the bot gently reminds
    the candidate it's still listening — without hanging up.
    """
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    return (
        f'<Gather input="speech" action="{respond_url}" method="POST" '
        f'speechTimeout="3" timeout="50" language="en-IN" enhanced="true">'
        f'<Say voice="alice" language="en-IN">Of course, take all the time you need. I\'m right here.</Say>'
        f'<Pause length="12"/>'
        f'<Say voice="alice" language="en-IN">Whenever you\'re ready, I\'m listening.</Say>'
        f'<Pause length="12"/>'
        f'<Say voice="alice" language="en-IN">I\'m still here, no rush at all.</Say>'
        f'<Pause length="12"/>'
        f'<Say voice="alice" language="en-IN">Please share your thoughts whenever you\'re ready.</Say>'
        f'</Gather>'
        f'<Redirect method="POST">{respond_url}</Redirect>'
    )


# Intent keywords
_REPEAT_KW  = {"repeat", "again", "pardon", "come again", "say that", "catch that",
                "didn't hear", "couldn't hear", "missed that", "what did you say"}
_THINK_KW   = {"moment", "second", "minute", "think", "hold on", "one sec", "give me",
                "let me", "need time", "just a", "few seconds", "bit of time", "need a bit"}
_FILLERS    = {"um", "uh", "hmm", "err", "ah", "uhh", "umm", "erm"}


def _detect_intent(speech: str) -> str:
    """Classify candidate speech: repeat | think | unclear | answer."""
    lower = speech.lower()
    meaningful = [w for w in lower.split() if w not in _FILLERS]

    if any(kw in lower for kw in _REPEAT_KW):
        return "repeat"
    if len(meaningful) <= 7 and any(kw in lower for kw in _THINK_KW):
        return "think"
    if len(meaningful) < 3:
        return "unclear"
    return "answer"


# ── Slot availability helper ─────────────────────────────────────────────────

async def _get_available_slots(db: AsyncSession) -> dict[str, list[str]]:
    """Return {iso_date: [HH:MM, ...]} for available 30-min slots over the next 5 days (IST).
    - 30-min buffer from now (enough prep time, not too restrictive)
    - Skips today if fewer than 2 slots remain (avoids rushed same-day booking)
    - Shows up to 5 days so candidates always have plenty of choice
    """
    now = datetime.now(IST)
    min_start = now + timedelta(minutes=30)

    booked: set[tuple] = set()
    for offset in range(6):
        check_date = (now + timedelta(days=offset)).date()
        result = await db.execute(
            select(ScreeningCall).where(
                and_(
                    ScreeningCall.scheduled_date == check_date,
                    ScreeningCall.status.in_([
                        CallStatus.pending, CallStatus.dialing,
                        CallStatus.in_progress, CallStatus.completed,
                    ])
                )
            )
        )
        for c in result.scalars().all():
            if c.scheduled_time:
                booked.add((check_date, c.scheduled_time.hour, c.scheduled_time.minute))

    available: dict[str, list[str]] = {}
    for offset in range(5):
        d = (now + timedelta(days=offset)).date()
        slots = []
        for hour in range(settings.call_window_start, settings.call_window_end):
            for minute in (0, 30):
                slot_dt = datetime(d.year, d.month, d.day, hour, minute, tzinfo=IST)
                if slot_dt > min_start and (d, hour, minute) not in booked:
                    slots.append(f"{hour:02d}:{minute:02d}")
        # Skip today if fewer than 2 slots remain — don't rush candidates
        if offset == 0 and len(slots) < 2:
            continue
        if slots:
            available[d.isoformat()] = slots

    return available


def _slot_picker_html(candidate_id: str, name: str, role: str, slots: dict[str, list[str]]) -> str:
    """Render the interview slot-picker page as an HTML string."""
    day_sections = ""
    for iso_date, times in slots.items():
        d = datetime.strptime(iso_date, "%Y-%m-%d")
        label = d.strftime("%A, %d %B %Y")
        time_buttons = ""
        for t in times:
            slot_val = f"{iso_date} {t}"
            time_buttons += (
                f'<label class="slot">'
                f'<input type="radio" name="slot" value="{slot_val}" required>'
                f'<span>{t}</span>'
                f'</label>'
            )
        day_sections += f"""
        <div class="day-block">
            <div class="day-label">{label}</div>
            <div class="time-grid">{time_buttons}</div>
        </div>"""

    if not day_sections:
        day_sections = '<p class="no-slots">No slots available in the next 5 days. Please contact HR directly.</p>'
        submit_btn = ""
    else:
        submit_btn = '<button type="submit" class="confirm-btn">Confirm My Interview Slot &#8594;</button>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedule Your Interview</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}}
    .card{{background:white;border-radius:16px;padding:32px;max-width:560px;width:100%;box-shadow:0 4px 6px -1px rgba(0,0,0,.1)}}
    .logo{{font-size:13px;font-weight:600;color:#4f46e5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:20px}}
    h1{{color:#111827;font-size:22px;margin-bottom:6px}}
    .subtitle{{color:#6b7280;font-size:14px;margin-bottom:28px}}
    .day-block{{margin-bottom:20px}}
    .day-label{{font-size:13px;font-weight:600;color:#374151;background:#f9fafb;padding:6px 12px;border-radius:6px;margin-bottom:10px}}
    .time-grid{{display:flex;flex-wrap:wrap;gap:8px}}
    .slot input{{display:none}}
    .slot span{{display:block;padding:8px 14px;border:2px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:#374151;transition:all .15s}}
    .slot input:checked+span{{border-color:#4f46e5;background:#eef2ff;color:#4f46e5}}
    .slot span:hover{{border-color:#a5b4fc}}
    .confirm-btn{{background:#4f46e5;color:white;border:none;width:100%;padding:14px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:24px}}
    .confirm-btn:hover{{background:#4338ca}}
    .note{{color:#9ca3af;font-size:12px;margin-top:10px;text-align:center}}
    .no-slots{{color:#6b7280;font-size:14px;padding:20px;text-align:center;background:#f9fafb;border-radius:8px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AI Hiring Bot</div>
    <h1>Schedule Your Interview</h1>
    <p class="subtitle">Hi <strong>{name}</strong>! You&#39;ve been shortlisted for the role of <strong>{role}</strong>. Pick a 30-minute slot &mdash; our AI interviewer will call you at that exact time.</p>
    <form method="POST" action="/voice/consent/{candidate_id}/schedule">
      {day_sections}
      {submit_btn}
      <p class="note">All times are IST &bull; Duration: ~25 minutes &bull; Be in a quiet place</p>
    </form>
  </div>
</body>
</html>"""


def _confirmed_html(name: str, slot_display: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Interview Scheduled</title>
  <style>
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}}
    .card{{background:white;border-radius:16px;padding:40px 32px;max-width:480px;width:100%;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);text-align:center}}
    .icon{{font-size:48px;margin-bottom:16px}}
    h1{{color:#065f46;font-size:22px;margin-bottom:8px}}
    p{{color:#374151;font-size:15px;margin-bottom:8px}}
    .slot-badge{{display:inline-block;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:10px 20px;border-radius:8px;font-weight:600;font-size:16px;margin:12px 0}}
    .tips{{text-align:left;background:#f9fafb;border-radius:10px;padding:16px;margin-top:20px}}
    .tips li{{color:#374151;font-size:13px;margin-bottom:6px;padding-left:4px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10004;&#65039;</div>
    <h1>You're All Set, {name}!</h1>
    <p>Your AI screening interview is confirmed for:</p>
    <div class="slot-badge">{slot_display} IST</div>
    <p>Our AI interviewer <strong>Alex</strong> will call you at this time.</p>
    <ul class="tips">
      <li>&#128222; Be near your phone — the call will come in right on time</li>
      <li>&#128222; Find a quiet place with good network coverage</li>
      <li>&#128084; Have your resume nearby for reference</li>
      <li>&#129302; Alex will introduce itself as an AI at the start</li>
    </ul>
  </div>
</body>
</html>"""


# ── Consent + Slot-Picker endpoint ────────────────────────────────────────────

@router.get("/consent/{candidate_id}", response_class=HTMLResponse)
async def candidate_consent(candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Candidate clicks the SMS link → sees available interview slots to pick from."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        return HTMLResponse("<h2>Invalid link. Please contact HR.</h2>", status_code=404)

    job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
    role = job.title if job else "the applied role"

    # If already has a scheduled pending call, show confirmation instead
    existing = await db.execute(
        select(ScreeningCall).where(
            and_(
                ScreeningCall.candidate_id == candidate_id,
                ScreeningCall.status == CallStatus.pending,
                ScreeningCall.scheduled_date.isnot(None),
            )
        )
    )
    existing_call = existing.scalars().first()
    if existing_call and existing_call.scheduled_date and existing_call.scheduled_time:
        slot_display = (
            f"{existing_call.scheduled_date.strftime('%A, %d %B %Y')} "
            f"at {existing_call.scheduled_time.strftime('%I:%M %p')}"
        )
        return HTMLResponse(_confirmed_html(candidate.name, slot_display))

    slots = await _get_available_slots(db)
    return HTMLResponse(_slot_picker_html(str(candidate_id), candidate.name, role, slots))


@router.post("/consent/{candidate_id}/schedule", response_class=HTMLResponse)
async def schedule_slot(
    candidate_id: uuid.UUID,
    slot: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Candidate submits their chosen slot — saves consent + creates pending ScreeningCall."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        return HTMLResponse("<h2>Invalid link. Please contact HR.</h2>", status_code=404)

    # Parse the slot value e.g. "2026-06-09 14:30"
    try:
        slot_dt = datetime.strptime(slot.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        return HTMLResponse("<h2>Invalid slot selected. Please go back and try again.</h2>", status_code=400)

    # Prevent double-booking on the same date+time (race condition guard)
    conflict = await db.execute(
        select(ScreeningCall).where(
            and_(
                ScreeningCall.scheduled_date == slot_dt.date(),
                ScreeningCall.scheduled_time == slot_dt.time(),
                ScreeningCall.status.in_([CallStatus.pending, CallStatus.dialing, CallStatus.in_progress]),
            )
        )
    )
    if conflict.scalars().first():
        slots = await _get_available_slots(db)
        job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
        role = job.title if job else "the applied role"
        return HTMLResponse(
            _slot_picker_html(str(candidate_id), candidate.name, role, slots)
            + "<script>alert('That slot was just taken. Please pick another.');</script>"
        )

    # Save consent + slot
    candidate.consent_given = True
    candidate.consent_at = datetime.utcnow()
    candidate.status = CandidateStatus.scheduled

    call_record = ScreeningCall(
        candidate_id=candidate.id,
        scheduled_date=slot_dt.date(),
        scheduled_time=slot_dt.time(),
        status=CallStatus.pending,
    )
    db.add(call_record)
    await db.commit()

    slot_display = slot_dt.strftime("%A, %d %B %Y at %I:%M %p")
    logger.info(f"[consent] {candidate.name} scheduled for {slot_display}")
    return HTMLResponse(_confirmed_html(candidate.name, slot_display))


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
    if candidate.status not in (CandidateStatus.analyzed, CandidateStatus.pending_review, CandidateStatus.scheduled):
        raise HTTPException(
            status_code=400,
            detail=f"Candidate not ready for call. Current status: {candidate.status}",
        )
    if not candidate.questions_json:
        raise HTTPException(status_code=400, detail="No questions generated yet — pipeline still running")

    # Cancel any existing pending scheduled calls for this candidate so the
    # schedule page doesn't keep showing them as "Pending" after a manual trigger.
    stale = await db.execute(
        select(ScreeningCall).where(
            and_(
                ScreeningCall.candidate_id == candidate.id,
                ScreeningCall.status == CallStatus.pending,
            )
        )
    )
    for stale_call in stale.scalars().all():
        stale_call.status = CallStatus.failed

    from datetime import date as _date, time as _time
    now_ist = datetime.now(IST)
    call_record = ScreeningCall(
        candidate_id=candidate.id,
        status=CallStatus.dialing,
        scheduled_date=now_ist.date(),
        scheduled_time=_time(now_ist.hour, now_ist.minute),
    )
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
    candidate.status = CandidateStatus.in_call
    await db.commit()

    # Notify candidate via email with scheduling link
    from backend.tasks import send_email_task
    from backend.notifications.templates import interview_invite_email_html
    job = await db.get(Job, candidate.jd_id)
    role = job.title if job else "the applied role"
    consent_url = f"{settings.webhook_base_url}/voice/consent/{candidate.id}"
    subject, html_body = interview_invite_email_html(candidate.name, role, settings.company_name, consent_url)
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
    else:
        logger.error(f"[voice_start] No ScreeningCall found for CallSid={CallSid} — report will be skipped")

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
        "company": settings.company_name,
        "questions": questions,
        "question_index": 0,
        "transcript": [],
        "silence_count": 0,
        "unclear_count": 0,
    })

    opening_text = generate_opening(candidate.name, role, settings.company_name)
    append_transcript(CallSid, "ai", opening_text)
    # Longer start_timeout on opening — candidate may need a moment to respond
    return _twiml(_play_or_say(opening_text, speech_timeout="3", start_timeout=30))


@router.post("/respond")
async def voice_respond(
    CallSid: str = Form(...),
    SpeechResult: str = Form(default=""),
):
    """
    Twilio calls this after each speech input (or timeout).
    Handles: repeat-question, thinking-time, unclear speech, silence, normal answers.
    """
    state = get_state(CallSid)
    if not state:
        return _twiml("<Say>Your session has expired. Thank you for your time. Goodbye.</Say><Hangup/>")

    speech = SpeechResult.strip()
    q_index   = state.get("question_index", 0)
    questions = state.get("questions", [])

    # Current question text (used for repeat intent)
    if q_index < len(questions):
        q = questions[q_index]
        current_q_text = q.get("question", q) if isinstance(q, dict) else str(q)
    else:
        current_q_text = ""

    # ── No speech detected (timeout) ────────────────────────────────────────
    if not speech:
        silence_count = state.get("silence_count", 0) + 1
        update_state(CallSid, {"silence_count": silence_count})

        if silence_count >= 3:
            # 3 consecutive silences → check in / close gracefully
            msg = ("I haven't been able to hear you for a while. "
                   "If you'd like to continue please say something now, "
                   "otherwise I'll wrap up — thank you so much for your time.")
            update_state(CallSid, {"silence_count": 0})
        else:
            msg = "I didn't catch that — could you speak a little louder or closer to the phone?"
        append_transcript(CallSid, "ai", msg)
        return _twiml(_play_or_say(msg))

    # Reset silence counter on any speech
    update_state(CallSid, {"silence_count": 0})

    # ── Intent detection ────────────────────────────────────────────────────
    intent = _detect_intent(speech)

    # Repeat-question intent — don't advance, replay question
    if intent == "repeat" and current_q_text:
        msg = f"Sure! Here's the question again: {current_q_text}"
        append_transcript(CallSid, "ai", msg)
        return _twiml(_play_or_say(msg, speech_timeout="4", start_timeout=30))

    # Thinking-time intent — don't advance, give them space with reminders
    if intent == "think":
        append_transcript(CallSid, "candidate", speech)
        return _twiml(_thinking_twiml())

    # Unclear / too short answer — ask to repeat without advancing
    if intent == "unclear":
        unclear_count = state.get("unclear_count", 0) + 1
        update_state(CallSid, {"unclear_count": unclear_count})
        if unclear_count >= 2:
            # Two failed attempts — accept what we have and move on
            update_state(CallSid, {"unclear_count": 0})
            append_transcript(CallSid, "candidate", speech or "[unclear]")
            update_state(CallSid, {"question_index": q_index + 1})
            state = get_state(CallSid)
            response_text, is_closing = generate_next_response(state)
        else:
            msg = "I'm sorry, I didn't quite catch that — could you say that again, a little slower?"
            append_transcript(CallSid, "ai", msg)
            return _twiml(_play_or_say(msg, speech_timeout="4"))

    # ── Normal answer — record, advance, generate next response ─────────────
    if intent == "answer":
        update_state(CallSid, {"unclear_count": 0})
        append_transcript(CallSid, "candidate", speech)
        update_state(CallSid, {"question_index": q_index + 1})
        state = get_state(CallSid)
        response_text, is_closing = generate_next_response(state)

    append_transcript(CallSid, "ai", response_text)

    if is_closing:
        run_report_gen.delay(CallSid)
        return _twiml(_say(response_text) + "<Hangup/>")

    return _twiml(_play_or_say(response_text, speech_timeout="4", start_timeout=25))


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

    # retry logic for no-answer / busy — send reschedule SMS, don't auto-dial
    candidate = await db.get(Candidate, call.candidate_id)
    if candidate and call.status == CallStatus.no_answer:
        reschedule_url = f"{settings.webhook_base_url}/voice/consent/{candidate.id}"
        job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
        role = job.title if job else "the applied role"
        if call.retry_count < settings.call_retry_count:
            call.retry_count += 1
            candidate.status = CandidateStatus.scheduled
            from backend.notifications.templates import reschedule_sms, reschedule_email_html
            from backend.tasks import send_email_task
            send_sms_task.delay(candidate.phone, reschedule_sms(candidate.name))
            subject, html = reschedule_email_html(candidate.name, role, settings.company_name, reschedule_url)
            send_email_task.delay(candidate.email, subject, html)
        else:
            candidate.status = CandidateStatus.rejected
            from backend.notifications.templates import unreachable_sms
            send_sms_task.delay(candidate.phone, unreachable_sms(candidate.name))

    await db.commit()
    return {"ok": True}
