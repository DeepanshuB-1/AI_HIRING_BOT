import asyncio
import uuid
import logging
import html
import json as _json
import random
import time as _time
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
from backend.voice.call_state import init_state, get_state, update_state, append_transcript, set_active_call, clear_active_call
from backend.voice.tts import synthesize
from backend.voice.twilio_client import initiate_call
from backend.services.interview_engine import generate_opening, generate_next_response, generate_followup_probe, generate_closing
from backend.services.deepgram_stt import transcribe_recording
from backend.tasks import run_report_gen, send_sms_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["Voice"])


def _twiml(content: str) -> Response:
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{content}</Response>',
        media_type="application/xml",
    )


async def _say(text: str, tts_timeout: float = 4.0) -> str:
    """Return a TwiML <Say> or <Play> block. Hard timeout on ElevenLabs — falls back to Twilio <Say>."""
    try:
        audio_path = await asyncio.wait_for(
            asyncio.to_thread(synthesize, text),
            timeout=tts_timeout,
        )
    except Exception:
        audio_path = None
    if audio_path:
        return f'<Play>{settings.webhook_base_url}{audio_path}</Play>'
    return f'<Say voice="alice" language="en-IN">{html.escape(text)}</Say>'


async def _play_or_say(
    text: str,
    speech_timeout: str | None = None,
    start_timeout: int | None = None,
) -> str:
    """
    Play AI speech then listen for candidate response via Twilio Gather + Deepgram nova-2.
    Twilio transcribes inline and posts SpeechResult to /voice/respond — no recording step.
    speechTimeout defaults to settings.gather_silence_seconds (T1: 5 s fixed silence window).
    """
    st = speech_timeout if speech_timeout is not None else str(settings.gather_silence_seconds)
    timeout = start_timeout if start_timeout is not None else settings.gather_start_timeout
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    inner = await _say(text)
    return (
        f'<Gather input="speech" action="{respond_url}" method="POST" '
        f'speechTimeout="{st}" timeout="{timeout}" '
        f'language="en-IN" speechModel="deepgram_nova-2" '
        f'hints="python, fastapi, react, sql, docker, internship, machine learning, rest api, java, nodejs">'
        f'{inner}'
        f'</Gather>'
        f'<Redirect method="POST">{respond_url}</Redirect>'
    )


def _thinking_twiml() -> str:
    """
    TwiML for when candidate asks for time to think.
    Uses <Pause> between <Say> blocks so every ~12s the bot gently reminds
    the candidate it's still listening — without hanging up.
    Extra patience: silence window = gather_silence_seconds + 1.
    """
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    st = str(settings.gather_silence_seconds + 1)
    return (
        f'<Gather input="speech" action="{respond_url}" method="POST" '
        f'speechTimeout="{st}" timeout="50" language="en-IN" speechModel="deepgram_nova-2">'
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


# H2: pre-cached neutral backchannels — never evaluative so they can't clash with the grounded ack
_BACKCHANNELS = ["Mm-hmm.", "Right.", "Okay.", "Got it.", "Alright."]

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

    # Send confirmation email with .ics calendar invite
    try:
        from backend.tasks import send_email_task
        from backend.notifications.templates import interview_invite_email_html
        from backend.notifications.ics import build_ics
        job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
        role = job.title if job else "the applied role"
        consent_url = f"{settings.webhook_base_url}/voice/consent/{candidate.id}"
        subject, html_body = interview_invite_email_html(candidate.name, role, settings.company_name, consent_url)
        ics_content = build_ics(
            summary=f"AI Screening Interview — {role}",
            slot_dt=slot_dt,
            description=f"Your AI screening call for {role} at {settings.company_name}. Alex (AI) will call you at this time.",
        )
        send_email_task.delay(candidate.email, subject, html_body, ics_attachment=ics_content)
    except Exception as exc:
        logger.warning(f"[consent] confirmation email failed: {exc}")

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

    # Pre-warm TTS cache for the opening phrase. Twilio takes 2-5 s to place the call,
    # so by the time /voice/start fires the audio is already cached — no ElevenLabs round-trip
    # during the live webhook, keeping us well within Twilio's 15 s timeout.
    try:
        from backend.voice.tts import synthesize as _tts_warm
        _opening_preview = generate_opening(candidate.name, role, settings.company_name)
        asyncio.create_task(asyncio.to_thread(_tts_warm, _opening_preview))
    except Exception:
        pass

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
    try:
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
            "recent_openers": [],
            "opening_done": False,
        })
        set_active_call(CallSid)

        try:
            opening_text = await asyncio.wait_for(
                asyncio.to_thread(generate_opening, candidate.name, role, settings.company_name),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            first = candidate.name.split()[0] if candidate.name else "there"
            opening_text = (
                f"Hi {first}! I'm Alex, your AI interviewer from {settings.company_name}. "
                f"I'll be conducting your screening for the {role} position today. "
                f"Are you ready to begin?"
            )
        append_transcript(CallSid, "ai", opening_text)
        return _twiml(await _play_or_say(opening_text, start_timeout=30))
    except Exception as exc:
        logger.error(f"[voice_start] Unhandled error: {exc}", exc_info=True)
        return _twiml(
            "<Say voice='alice' language='en-IN'>"
            "Sorry, a system error occurred. Our team will call you back shortly. Goodbye."
            "</Say><Hangup/>"
        )


async def _generate_and_cache_reply(call_sid: str, state: dict, new_q_index: int):
    """H2: Background task — run LLM and cache result in Redis for /voice/continue to pick up."""
    from backend.redis_client import get_redis
    try:
        response_text, is_closing = await asyncio.to_thread(generate_next_response, state)
        # persist the updated recent_openers that generate_next_response mutated in-place
        update_state(call_sid, {"recent_openers": state.get("recent_openers", [])})
        payload = _json.dumps({"text": response_text, "is_closing": is_closing})
        get_redis().setex(f"reply:{call_sid}:{new_q_index}", 600, payload)
    except Exception as exc:
        logger.error(f"[bg_reply] {call_sid} q{new_q_index}: {exc}")


async def _generate_and_cache_probe(call_sid: str, state: dict, q_index: int):
    """H2: Background task — generate follow-up probe and cache in Redis for /voice/continue-probe."""
    from backend.redis_client import get_redis
    try:
        probe_text = await asyncio.to_thread(generate_followup_probe, state, q_index)
        get_redis().setex(f"probe:{call_sid}:{q_index}", 300, probe_text)
    except Exception as exc:
        logger.error(f"[bg_probe] {call_sid} q{q_index}: {exc}")


async def _inline_advance(call_sid: str, state: dict, q_index: int, questions: list) -> Response:
    """
    Advance to the next question inline — no <Redirect>, no audio file fetching.
    Uses Twilio <Say> for all mid-interview speech to eliminate ngrok audio-fetch failures.
    Polls Redis up to 5 s for the background LLM result; falls back to raw question text.
    """
    from backend.redis_client import get_redis as _get_redis

    new_q_index = q_index + 1
    update_state(call_sid, {"question_index": new_q_index})
    state = get_state(call_sid)

    asyncio.create_task(_generate_and_cache_reply(call_sid, state, new_q_index))

    key = f"reply:{call_sid}:{new_q_index}"
    response_text: str | None = None
    is_closing = False
    _t = _time.monotonic()
    for _ in range(20):  # 20 × 0.25 s = 5 s max poll
        raw = _get_redis().get(key)
        if raw:
            _get_redis().delete(key)
            p = _json.loads(raw)
            response_text, is_closing = p["text"], p["is_closing"]
            break
        await asyncio.sleep(0.25)
    logger.info(f"[inline_advance] {call_sid} q{q_index}→{new_q_index} LLM {_time.monotonic()-_t:.2f}s found={response_text is not None}")

    if response_text is None:
        # LLM too slow — fall back to raw question text (no warm opener)
        if new_q_index < len(questions):
            q = questions[new_q_index]
            response_text = q.get("question", q) if isinstance(q, dict) else str(q)
        else:
            first = state.get("candidate_name", "there").split()[0]
            response_text = (
                f"Thank you so much {first}! I really appreciated all your answers today. "
                f"The team will be in touch within 3 to 5 business days. Best of luck!"
            )
            is_closing = True

    append_transcript(call_sid, "ai", response_text)

    # Use <Say> (Twilio built-in TTS) — no audio file fetch, no ngrok dependency,
    # no second HTTP request. ElevenLabs is reserved for the opening greeting.
    backchannel_text = random.choice(_BACKCHANNELS)
    safe_response = html.escape(response_text)
    safe_backchannel = html.escape(backchannel_text)

    if is_closing:
        update_state(call_sid, {"interview_completed": True})
        run_report_gen.delay(call_sid)
        return _twiml(
            f'<Say voice="alice" language="en-IN">{safe_backchannel}</Say>'
            f'<Say voice="alice" language="en-IN">{safe_response}</Say>'
            f'<Hangup/>'
        )

    respond_url = f"{settings.webhook_base_url}/voice/respond"
    return _twiml(
        f'<Say voice="alice" language="en-IN">{safe_backchannel}</Say>'
        f'<Gather input="speech" action="{respond_url}" method="POST" '
        f'speechTimeout="{settings.gather_silence_seconds}" '
        f'timeout="{settings.gather_start_timeout}" '
        f'language="en-IN" speechModel="deepgram_nova-2" '
        f'hints="python, fastapi, react, sql, docker, internship, machine learning, '
        f'rest api, java, nodejs">'
        f'<Say voice="alice" language="en-IN">{safe_response}</Say>'
        f'</Gather>'
        f'<Redirect method="POST">{respond_url}</Redirect>'
    )


async def _handle_speech(call_sid: str, speech: str) -> Response:
    """
    Core interview turn logic — shared by /respond (Twilio STT) and /transcribe (Deepgram).
    speech is already stripped and length-capped before calling.
    """
    state = get_state(call_sid)
    if not state:
        return _twiml("<Say>Your session has expired. Thank you for your time. Goodbye.</Say><Hangup/>")

    q_index   = state.get("question_index", 0)
    questions = state.get("questions", [])

    if q_index < len(questions):
        q = questions[q_index]
        current_q_text = q.get("question", q) if isinstance(q, dict) else str(q)
    else:
        current_q_text = ""

    # ── No speech detected (T3: 3-tier gentle silence nudges) ────────────────
    if not speech:
        silence_count = state.get("silence_count", 0) + 1
        update_state(call_sid, {"silence_count": silence_count})
        if silence_count == 1:
            msg = "Take your time — I'm listening whenever you're ready."
            append_transcript(call_sid, "ai", msg)
            return _twiml(await _play_or_say(msg, start_timeout=25))
        elif silence_count == 2:
            msg = "Would you like me to repeat the question?"
            append_transcript(call_sid, "ai", msg)
            return _twiml(await _play_or_say(msg, start_timeout=25))
        else:
            msg = ("I haven't been able to hear you for a while. "
                   "If you'd like to continue please say something now, "
                   "otherwise I'll wrap up — thank you so much for your time.")
            update_state(call_sid, {"silence_count": 0})
            append_transcript(call_sid, "ai", msg)
            return _twiml(await _play_or_say(msg))

    update_state(call_sid, {"silence_count": 0})

    # ── Consent response to opening greeting ─────────────────────────────────
    # Any speech here means the candidate is ready — skip probe logic entirely
    # and ask the first real question.
    if not state.get("opening_done", True):
        update_state(call_sid, {"opening_done": True})
        questions = state.get("questions", [])
        first_name = state.get("candidate_name", "there").split()[0]
        if not questions:
            closing = f"Thank you so much {first_name} for your time! We'll be in touch soon."
            append_transcript(call_sid, "ai", closing)
            update_state(call_sid, {"interview_completed": True})
            run_report_gen.delay(call_sid)
            return _twiml(await _say(closing) + "<Hangup/>")
        # Read question 0 directly — no LLM, no Redirect, no race condition.
        # This guarantees a response well within Twilio's 15 s window.
        first_q = questions[0]
        first_q_text = first_q.get("question", first_q) if isinstance(first_q, dict) else str(first_q)
        warm_openers = [
            f"Perfect, thanks {first_name}! Let's dive right in.",
            f"Great to hear that, {first_name}! Let's get started.",
            f"Wonderful! Thanks for making time today. Let's begin.",
        ]
        first_msg = f"{random.choice(warm_openers)} {first_q_text}"
        append_transcript(call_sid, "ai", first_msg)
        logger.info(f"[_handle_speech] {call_sid} opening_done → asking q0, synthesizing...")
        _ts = _time.monotonic()
        result = await _play_or_say(first_msg)
        logger.info(f"[_handle_speech] {call_sid} q0 TTS done in {_time.monotonic()-_ts:.2f}s")
        return _twiml(result)

    # ── Intent detection ─────────────────────────────────────────────────────
    intent = _detect_intent(speech)

    if intent == "repeat" and current_q_text:
        msg = f"Sure! Here's the question again: {current_q_text}"
        append_transcript(call_sid, "ai", msg)
        return _twiml(await _play_or_say(msg, start_timeout=30))

    if intent == "think":
        append_transcript(call_sid, "candidate", speech)
        return _twiml(_thinking_twiml())

    if intent == "unclear":
        unclear_count = state.get("unclear_count", 0) + 1
        update_state(call_sid, {"unclear_count": unclear_count})
        if unclear_count >= 2:
            update_state(call_sid, {"unclear_count": 0})
            append_transcript(call_sid, "candidate", speech or "[unclear]")
            # T2: time budget check before advancing
            started_at = state.get("started_at", _time.time())
            elapsed = _time.time() - started_at
            budget_s = settings.max_call_minutes * 60
            if elapsed > budget_s - settings.wrapup_buffer_seconds:
                update_state(call_sid, {
                    "ended_early": True,
                    "unasked_questions": list(range(q_index + 1, len(questions))),
                })
                state = get_state(call_sid)
                try:
                    closing_text = await asyncio.wait_for(
                        asyncio.to_thread(generate_closing, state), timeout=10.0
                    )
                except asyncio.TimeoutError:
                    first = state.get("candidate_name", "there").split()[0]
                    closing_text = (
                        f"Thank you so much {first}! I really appreciate your time today. "
                        f"The {state.get('company', 'our')} HR team will review your screening and be in touch soon. "
                        f"Best of luck!"
                    )
                append_transcript(call_sid, "ai", closing_text)
                update_state(call_sid, {"interview_completed": True})
                run_report_gen.delay(call_sid)
                return _twiml(await _say(closing_text) + "<Hangup/>")
            return await _inline_advance(call_sid, state, q_index, questions)
        else:
            msg = "I'm sorry, I didn't quite catch that — could you say that again?"
            append_transcript(call_sid, "ai", msg)
            return _twiml(await _play_or_say(msg))

    # ── Normal answer — optionally probe, then advance ───────────────────────
    if intent == "answer":
        update_state(call_sid, {"unclear_count": 0})
        append_transcript(call_sid, "candidate", speech)

        started_at = state.get("started_at", _time.time())
        elapsed = _time.time() - started_at
        budget_s = settings.max_call_minutes * 60

        # NOTE: probe follow-up questions are disabled for now — routing everything
        # through /voice/continue to keep a single tested code path.
        # Re-enable /voice/continue-probe once the base flow is confirmed stable.

        # T2: time budget check before advancing to next question
        if elapsed > budget_s - settings.wrapup_buffer_seconds:
            update_state(call_sid, {
                "ended_early": True,
                "unasked_questions": list(range(q_index + 1, len(questions))),
            })
            state = get_state(call_sid)
            try:
                closing_text = await asyncio.wait_for(
                    asyncio.to_thread(generate_closing, state), timeout=10.0
                )
            except asyncio.TimeoutError:
                first = state.get("candidate_name", "there").split()[0]
                closing_text = (
                    f"Thank you so much {first}! I really appreciate all your answers today. "
                    f"The {state.get('company', 'our')} HR team will be in touch within 3 to 5 business days. "
                    f"Best of luck!"
                )
            append_transcript(call_sid, "ai", closing_text)
            update_state(call_sid, {"interview_completed": True})
            run_report_gen.delay(call_sid)
            return _twiml(await _say(closing_text) + "<Hangup/>")

        return await _inline_advance(call_sid, state, q_index, questions)


@router.post("/transcribe")
async def voice_transcribe(
    CallSid: str = Form(...),
    RecordingUrl: str = Form(default=""),
    RecordingSid: str = Form(default=""),
    RecordingDuration: str = Form(default="0"),
):
    """
    LEGACY — only used if the <Record> path is manually re-enabled.
    Current flow uses <Gather speechModel=deepgram_nova-2> → /voice/respond instead.
    """
    try:
        speech = ""
        duration = int(RecordingDuration or "0")
        if RecordingUrl and duration >= 1:
            speech = await transcribe_recording(RecordingUrl)
        speech = speech.strip()[:2000]
        logger.info(f"[transcribe] CallSid={CallSid} duration={duration}s transcript={speech[:80]!r}")
        return await _handle_speech(CallSid, speech)
    except Exception as exc:
        logger.error(f"[voice_transcribe] Unhandled error: {exc}", exc_info=True)
        respond_url = f"{settings.webhook_base_url}/voice/respond"
        return _twiml(
            f'<Say voice="alice" language="en-IN">Sorry, I had a brief issue. Could you say that again?</Say>'
            f'<Gather input="speech" action="{respond_url}" method="POST" '
            f'speechTimeout="5" timeout="12" language="en-IN" speechModel="deepgram_nova-2"></Gather>'
            f'<Redirect method="POST">{respond_url}</Redirect>'
        )


@router.post("/respond")
async def voice_respond(
    CallSid: str = Form(...),
    SpeechResult: str = Form(default=""),
):
    """
    Primary speech handler — Twilio Gather posts SpeechResult here after each turn.
    Hard 12-second ceiling guards against Twilio's 15-second webhook timeout.
    """
    _t0 = _time.monotonic()
    respond_url = f"{settings.webhook_base_url}/voice/respond"
    try:
        speech = SpeechResult.strip()[:2000]
        logger.info(f"[voice_respond] {CallSid} speech={speech[:60]!r}")
        result = await asyncio.wait_for(_handle_speech(CallSid, speech), timeout=12.0)
        logger.info(f"[voice_respond] {CallSid} done in {_time.monotonic()-_t0:.2f}s")
        return result
    except asyncio.TimeoutError:
        logger.error(f"[voice_respond] TOTAL TIMEOUT {CallSid} after {_time.monotonic()-_t0:.2f}s — returning fast fallback")
        return _twiml(
            f'<Say voice="alice" language="en-IN">Sorry, I need a moment. Could you say that again?</Say>'
            f'<Gather input="speech" action="{respond_url}" method="POST" '
            f'speechTimeout="5" timeout="12" language="en-IN" speechModel="deepgram_nova-2"></Gather>'
            f'<Redirect method="POST">{respond_url}</Redirect>'
        )
    except Exception as exc:
        logger.error(f"[voice_respond] Unhandled error after {_time.monotonic()-_t0:.2f}s: {exc}", exc_info=True)
        return _twiml(
            f'<Say voice="alice" language="en-IN">Sorry, I had a brief glitch — could you say that again?</Say>'
            f'<Gather input="speech" action="{respond_url}" method="POST" '
            f'speechTimeout="5" timeout="12" language="en-IN" speechModel="deepgram_nova-2"></Gather>'
            f'<Redirect method="POST">{respond_url}</Redirect>'
        )


@router.post("/continue")
async def voice_continue(
    CallSid: str = Form(...),
):
    """
    H2: Plays the background-generated LLM reply.
    Reads the current question index from Redis call state — no URL Query param needed.
    Polls Redis up to 4 s; falls back to inline generation (7 s timeout) if not ready.
    """
    _t0 = _time.monotonic()
    try:
        from backend.redis_client import get_redis

        state = get_state(CallSid)
        if not state:
            return _twiml("<Say>Session expired. Thank you for your time. Goodbye.</Say><Hangup/>")

        q_idx = state.get("question_index", 0)
        key = f"reply:{CallSid}:{q_idx}"
        payload = None

        for _ in range(16):  # 16 × 0.25 s = 4 s max wait
            raw = get_redis().get(key)
            if raw:
                get_redis().delete(key)
                payload = _json.loads(raw)
                break
            await asyncio.sleep(0.25)

        logger.info(f"[voice_continue] {CallSid} q{q_idx} poll done in {_time.monotonic()-_t0:.2f}s found={payload is not None}")

        respond_url = f"{settings.webhook_base_url}/voice/respond"

        if payload is None:
            # LLM was slow — generate inline with a 7 s timeout (already 4 s into budget).
            # Always use <Say> here (skip ElevenLabs) to guarantee < 15 s total.
            try:
                response_text, is_closing = await asyncio.wait_for(
                    asyncio.to_thread(generate_next_response, state),
                    timeout=7.0,
                )
                update_state(CallSid, {"recent_openers": state.get("recent_openers", [])})
                append_transcript(CallSid, "ai", response_text)
                logger.info(f"[voice_continue] {CallSid} q{q_idx} inline LLM done in {_time.monotonic()-_t0:.2f}s")
                if is_closing:
                    update_state(CallSid, {"interview_completed": True})
                    run_report_gen.delay(CallSid)
                    return _twiml(
                        f'<Say voice="alice" language="en-IN">{html.escape(response_text)}</Say><Hangup/>'
                    )
                return _twiml(
                    f'<Gather input="speech" action="{respond_url}" method="POST" '
                    f'speechTimeout="{settings.gather_silence_seconds}" '
                    f'timeout="{settings.gather_start_timeout}" '
                    f'language="en-IN" speechModel="deepgram_nova-2">'
                    f'<Say voice="alice" language="en-IN">{html.escape(response_text)}</Say>'
                    f'</Gather>'
                    f'<Redirect method="POST">{respond_url}</Redirect>'
                )
            except asyncio.TimeoutError:
                # ~11 s into budget — return raw question via <Say>, no ElevenLabs
                logger.warning(f"[voice_continue] inline LLM timeout {CallSid} q{q_idx} — raw question")
                questions = state.get("questions", [])
                if q_idx < len(questions):
                    q = questions[q_idx]
                    raw_q = q.get("question", q) if isinstance(q, dict) else str(q)
                    append_transcript(CallSid, "ai", raw_q)
                    return _twiml(
                        f'<Gather input="speech" action="{respond_url}" method="POST" '
                        f'speechTimeout="{settings.gather_silence_seconds}" '
                        f'timeout="{settings.gather_start_timeout}" '
                        f'language="en-IN" speechModel="deepgram_nova-2">'
                        f'<Say voice="alice" language="en-IN">{html.escape(raw_q)}</Say>'
                        f'</Gather>'
                        f'<Redirect method="POST">{respond_url}</Redirect>'
                    )
                else:
                    first = state.get("candidate_name", "there").split()[0]
                    closing = (
                        f"Thank you so much {first}! I really appreciated speaking with you today. "
                        f"The team will be in touch within 3 to 5 business days. Best of luck!"
                    )
                    append_transcript(CallSid, "ai", closing)
                    update_state(CallSid, {"interview_completed": True})
                    run_report_gen.delay(CallSid)
                    return _twiml(
                        f'<Say voice="alice" language="en-IN">{html.escape(closing)}</Say><Hangup/>'
                    )

        response_text = payload["text"]
        is_closing    = payload["is_closing"]
        append_transcript(CallSid, "ai", response_text)
        logger.info(f"[voice_continue] {CallSid} q{q_idx} cached reply ready, synthesizing TTS...")

        if is_closing:
            update_state(CallSid, {"interview_completed": True})
            run_report_gen.delay(CallSid)
            return _twiml(await _say(response_text) + "<Hangup/>")

        return _twiml(await _play_or_say(response_text))

    except Exception as exc:
        logger.error(f"[voice_continue] Unhandled error after {_time.monotonic()-_t0:.2f}s: {exc}", exc_info=True)
        respond_url = f"{settings.webhook_base_url}/voice/respond"
        return _twiml(
            f'<Say voice="alice" language="en-IN">Sorry about that — could you please repeat your last answer?</Say>'
            f'<Gather input="speech" action="{respond_url}" method="POST" '
            f'speechTimeout="5" timeout="12" language="en-IN" speechModel="deepgram_nova-2"></Gather>'
            f'<Redirect method="POST">{respond_url}</Redirect>'
        )


@router.post("/continue-probe")
async def voice_continue_probe(
    CallSid: str = Form(...),
    q_idx: int = Query(...),
):
    """H2: Delivers the background-generated follow-up probe question."""
    _t0 = _time.monotonic()
    try:
        from backend.redis_client import get_redis
        key = f"probe:{CallSid}:{q_idx}"
        probe_text = None

        for _ in range(12):  # 12 × 0.25 s = 3 s max wait (leaves 12 s headroom for ElevenLabs)
            raw = get_redis().get(key)
            if raw:
                get_redis().delete(key)
                probe_text = raw.decode()
                break
            await asyncio.sleep(0.25)

        logger.info(f"[continue_probe] {CallSid} q{q_idx} poll done in {_time.monotonic()-_t0:.2f}s, found={probe_text is not None}")

        state = get_state(CallSid)
        if not state:
            return _twiml("<Say>Session expired. Thank you for your time. Goodbye.</Say><Hangup/>")

        if probe_text is None:
            # LLM too slow — skip probe and advance to the next question
            logger.warning(f"[continue_probe] timeout {CallSid} q{q_idx} — skipping probe, advancing")
            q_index = state.get("question_index", 0)
            new_q_index = q_index + 1
            update_state(CallSid, {"question_index": new_q_index})
            state = get_state(CallSid)
            _ts = _time.monotonic()
            filler_audio = await _say(random.choice(_BACKCHANNELS))
            logger.info(f"[continue_probe] {CallSid} skip-filler done in {_time.monotonic()-_ts:.2f}s")
            asyncio.create_task(_generate_and_cache_reply(CallSid, state, new_q_index))
            continue_url = f"{settings.webhook_base_url}/voice/continue"
            return _twiml(f"{filler_audio}<Redirect method='POST'>{continue_url}</Redirect>")

        append_transcript(CallSid, "ai", probe_text)
        _ts = _time.monotonic()
        result = await _play_or_say(probe_text, start_timeout=25)
        logger.info(f"[continue_probe] {CallSid} probe TTS done in {_time.monotonic()-_ts:.2f}s, total={_time.monotonic()-_t0:.2f}s")
        return _twiml(result)

    except Exception as exc:
        logger.error(f"[voice_continue_probe] Unhandled error after {_time.monotonic()-_t0:.2f}s: {exc}", exc_info=True)
        respond_url = f"{settings.webhook_base_url}/voice/respond"
        return _twiml(
            f'<Say voice="alice" language="en-IN">Could you tell me a little more about that?</Say>'
            f'<Gather input="speech" action="{respond_url}" method="POST" '
            f'speechTimeout="5" timeout="12" language="en-IN" speechModel="deepgram_nova-2"></Gather>'
            f'<Redirect method="POST">{respond_url}</Redirect>'
        )


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

    clear_active_call()

    status_lower = call_status_raw.lower()
    if status_lower == "completed":
        call.status = CallStatus.completed
    elif status_lower in ("no-answer", "busy"):
        call.status = CallStatus.no_answer
    else:
        call.status = CallStatus.failed

    # Detect mid-interview interruption.
    # Twilio sends "completed" even for webhook-error hangups, so we can't rely on CallStatus.failed.
    # Instead we use the interview_completed flag written to Redis just before run_report_gen fires.
    interview_completed = state.get("interview_completed", False) if state else False
    if state and state.get("transcript") and not interview_completed and call.status != CallStatus.no_answer:
        candidate = await db.get(Candidate, call.candidate_id)
        if candidate:
            job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
            role = job.title if job else "the applied role"
            reschedule_url = f"{settings.webhook_base_url}/voice/consent/{candidate.id}"

            # Reset candidate so scheduler can retry
            candidate.status = CandidateStatus.scheduled

            # Apology email to candidate
            from backend.tasks import send_email_task
            from backend.notifications.templates import call_interrupted_email_html, call_interrupted_hr_email_html
            subj, html_body = call_interrupted_email_html(
                candidate.name, role, settings.company_name, reschedule_url
            )
            send_email_task.delay(candidate.email, subj, html_body)

            # Alert email to HR
            hr_subj, hr_html = call_interrupted_hr_email_html(
                candidate.name, role, settings.company_name, len(state["transcript"])
            )
            send_email_task.delay(settings.hr_email, hr_subj, hr_html)

            # HR portal notification (bell icon)
            from backend.models.notification import HRNotification
            notif = HRNotification(
                type="call_interrupted",
                title=f"Call interrupted — {candidate.name}",
                message=(
                    f"{candidate.name}'s screening call for {role} was interrupted after "
                    f"{len(state['transcript'])} transcript turns. "
                    f"Their status has been reset to Scheduled for a retry."
                ),
                candidate_id=candidate.id,
            )
            db.add(notif)
            logger.warning(
                f"[voice_status] Call interrupted mid-interview: candidate={candidate.name} "
                f"transcript_turns={len(state['transcript'])}"
            )

    # Update candidate status only when interview ran to natural completion
    if call.status == CallStatus.completed and interview_completed:
        _done_cand = await db.get(Candidate, call.candidate_id)
        if _done_cand and _done_cand.status == CandidateStatus.in_call:
            _done_cand.status = CandidateStatus.pending_review

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
