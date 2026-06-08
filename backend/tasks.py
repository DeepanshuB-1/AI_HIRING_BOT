from .celery_app import celery
import logging
import asyncio

logger = logging.getLogger(__name__)


def _run(coro):
    """
    Run an async coroutine in a brand-new event loop.
    Replaces the module-level SQLAlchemy engine + session with a fresh one
    so asyncpg doesn't try to use connections from the previous (closed) loop.
    coro must import AsyncSessionLocal INSIDE the async function body, not from
    an outer closure — otherwise it captures the old binding.
    """
    from . import database as _db
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    new_engine = create_async_engine(_db.engine.url, echo=False, pool_pre_ping=True)
    _db.engine = new_engine
    _db.AsyncSessionLocal = async_sessionmaker(
        new_engine, class_=AsyncSession, expire_on_commit=False
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.run_until_complete(new_engine.dispose())
        except Exception:
            pass
        loop.close()


def _mark_failed(candidate_id: str):
    """Set candidate status to failed (pipeline error) after all retries exhausted."""
    import uuid

    async def _update():
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate, CandidateStatus
        async with AsyncSessionLocal() as db:
            candidate = await db.get(Candidate, uuid.UUID(candidate_id))
            if candidate and candidate.status not in ("rejected", "completed", "failed"):
                candidate.status = CandidateStatus.failed
                await db.commit()

    _run(_update())


@celery.task(name="backend.tasks.run_profile_extraction", bind=True, max_retries=2)
def run_profile_extraction(self, candidate_id: str, resume_path: str):
    """Layer 1+2: Parse resume, extract structured profile, store profile_embedding."""
    try:
        import uuid
        from .services.resume_parser import extract_resume_text
        from .services.profile_extractor import extract_profile_with_embedding

        text = extract_resume_text(resume_path)
        profile, profile_embedding = extract_profile_with_embedding(text)

        async def _save():
            from .database import AsyncSessionLocal
            from .models.candidate import Candidate
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if candidate:
                    candidate.resume_text = text
                    candidate.profile_json = profile
                    candidate.profile_embedding = profile_embedding
                    await db.commit()

        _run(_save())
        logger.info(f"Profile extracted for candidate {candidate_id}")
        return {"status": "ok", "candidate_id": candidate_id}
    except Exception as exc:
        logger.error(f"Profile extraction failed: {exc}")
        if self.request.retries >= self.max_retries:
            _mark_failed(candidate_id)
            return {"status": "failed", "candidate_id": candidate_id}
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_embedding_layer", bind=True, max_retries=2)
def run_embedding_layer(self, candidate_id: str, resume_path: str, jd_id: str, jd_text: str):
    """Layer 1.5: Generate resume + JD embeddings, store in pgvector."""
    try:
        import uuid
        from .services.resume_parser import extract_resume_text
        from .services.embedding_layer import generate_and_store_embeddings

        async def _embed():
            from .database import AsyncSessionLocal
            from .models.candidate import Candidate
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                resume_text = (
                    candidate.resume_text
                    if candidate and candidate.resume_text
                    else extract_resume_text(resume_path)
                )
                score = await generate_and_store_embeddings(
                    candidate_id, resume_text, jd_id, jd_text, db
                )
                return score

        quick_score = _run(_embed())
        logger.info(f"Embeddings stored for candidate {candidate_id} — quick score: {quick_score}")
        return {"status": "ok", "quick_score": quick_score}
    except Exception as exc:
        logger.error(f"Embedding layer failed: {exc}")
        if self.request.retries >= self.max_retries:
            _mark_failed(candidate_id)
            return {"status": "failed", "candidate_id": candidate_id}
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_jd_scoring", bind=True, max_retries=2)
def run_jd_scoring(self, candidate_id: str, jd_text: str):
    """Layer 3: Two-stage scoring — pgvector cosine (40%) + LLM (60%)."""
    try:
        import uuid

        async def _score():
            from .database import AsyncSessionLocal
            from .models.candidate import Candidate
            from .services.jd_matcher import score_candidate_v2, should_proceed
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile yet")

                scores = await score_candidate_v2(candidate_id, candidate.profile_json, jd_text, db)

                candidate.match_score = int(scores.get("overall_score", 0))
                candidate.match_details = scores
                candidate.vector_score = scores.get("vector_score")
                candidate.llm_score = scores.get("llm_score")

                decision = should_proceed(scores)
                if decision == "reject":
                    candidate.status = "rejected"
                elif decision == "review":
                    candidate.status = "pending_review"
                else:
                    candidate.status = "analyzed"

                candidate_name = candidate.name
                candidate_email = candidate.email
                candidate_phone = candidate.phone
                await db.commit()
                return {
                    **scores,
                    "_decision": decision,
                    "_name": candidate_name,
                    "_email": candidate_email,
                    "_phone": candidate_phone,
                    "_cid": candidate_id,
                }

        result = _run(_score())
        decision = result.get("_decision")

        if decision == "reject":
            # Rejected — send rejection email, no SMS
            from .config import settings as _s
            from .notifications.templates import rejection_email_html
            from .notifications.email import send_email
            subject, html = rejection_email_html(result["_name"], "the applied role", _s.company_name)
            send_email_task.delay(result["_email"], subject, html)

        else:
            # Passed threshold — send SMS consent link so candidate can approve the call
            from .config import settings as _s
            from .notifications.templates import consent_sms
            consent_url = f"{_s.webhook_base_url}/voice/consent/{result['_cid']}"
            send_sms_task.delay(result["_phone"], consent_sms(result["_name"], consent_url))

        return result
    except Exception as exc:
        logger.error(f"JD scoring failed: {exc}")
        if self.request.retries >= self.max_retries:
            _mark_failed(candidate_id)
            return {"status": "failed", "candidate_id": candidate_id}
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_question_gen", bind=True, max_retries=2)
def run_question_gen(self, candidate_id: str, jd_id: str, jd_text: str):
    """Layer 4: Generate personalised questions with pgvector deduplication."""
    try:
        import uuid

        async def _gen():
            from .database import AsyncSessionLocal
            from .models.candidate import Candidate
            from .services.question_gen import generate_questions
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile")

                questions = await generate_questions(
                    candidate.profile_json, jd_text, jd_id, db
                )
                candidate.questions_json = questions
                await db.commit()
                return questions

        return _run(_gen())
    except Exception as exc:
        logger.error(f"Question generation failed: {exc}")
        if self.request.retries >= self.max_retries:
            _mark_failed(candidate_id)
            return {"status": "failed", "candidate_id": candidate_id}
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_report_gen", bind=True, max_retries=2)
def run_report_gen(self, call_sid: str):
    """Layer 6: Generate post-call score report and store report_embedding."""
    try:
        import uuid
        from .voice.call_state import get_state
        from .services.report_gen import generate_report_with_embedding

        state = get_state(call_sid)

        async def _save():
            from .database import AsyncSessionLocal
            from .models.call import ScreeningCall
            from .models.report import ScoreReport
            from .models.candidate import Candidate
            async with AsyncSessionLocal() as db:
                call = await db.get(ScreeningCall, uuid.UUID(state["call_id"]))
                candidate = await db.get(Candidate, call.candidate_id)
                report_data, report_embedding = generate_report_with_embedding(
                    state, candidate.profile_json or {}
                )
                report = ScoreReport(
                    call_id=call.id,
                    overall_score=int(report_data.get("overall_score", 0)),
                    skills_score=int(report_data.get("skills_score", 0)),
                    experience_score=int(report_data.get("experience_score", 0)),
                    communication_score=int(report_data.get("communication_score", 0)),
                    culture_fit_score=int(report_data.get("culture_fit_score", 0)),
                    confidence_score=int(report_data.get("confidence_score", 0)),
                    ai_recommendation=report_data.get("recommendation", "HOLD"),
                    ai_reasoning=report_data.get("reasoning", ""),
                    red_flags=report_data.get("red_flags", []),
                    strengths=report_data.get("strengths", []),
                    next_round_questions=report_data.get("next_round_questions", []),
                    report_model="llama3.1:8b",
                    report_embedding=report_embedding,
                )
                db.add(report)
                call.status = "completed"
                candidate.status = "completed"
                await db.commit()
                return {
                    "candidate_name": candidate.name,
                    "candidate_email": candidate.email,
                    "role": state.get("role", "the applied role"),
                    "overall_score": report.overall_score,
                    "recommendation": report_data.get("recommendation", "HOLD"),
                    "reasoning": report_data.get("reasoning", ""),
                    "strengths": report_data.get("strengths", []),
                    "red_flags": report_data.get("red_flags", []),
                    "next_round_questions": report_data.get("next_round_questions", []),
                }

        result = _run(_save())
        logger.info(f"Report generated for call {call_sid}")

        # Email HR the report
        from .config import settings as _s
        from .notifications.templates import hr_report_email_html
        from .notifications.email import send_email
        subject, html = hr_report_email_html(
            candidate_name=result["candidate_name"],
            role=result["role"],
            overall_score=result["overall_score"],
            recommendation=result["recommendation"],
            reasoning=result["reasoning"],
            strengths=result["strengths"],
            red_flags=result["red_flags"],
            next_round_questions=result["next_round_questions"],
            company=_s.company_name,
        )
        send_email(result["candidate_email"], subject, html)  # send to HR
        send_email_task.delay(_s.hr_email, subject, html)

        return {"status": "ok", "call_sid": call_sid}
    except Exception as exc:
        logger.error(f"Report generation failed: {exc}")
        if self.request.retries >= self.max_retries:
            return {"status": "failed", "call_sid": call_sid}
        raise self.retry(exc=exc, countdown=15)


@celery.task(name="backend.tasks.send_email_task")
def send_email_task(to_email: str, subject: str, html_content: str):
    from .notifications.email import send_email
    return send_email(to_email, subject, html_content)


@celery.task(name="backend.tasks.send_sms_task")
def send_sms_task(to_phone: str, message: str):
    from .notifications.sms import send_sms
    return send_sms(to_phone, message)
