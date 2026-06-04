from .celery_app import celery
import logging

logger = logging.getLogger(__name__)


@celery.task(name="backend.tasks.run_profile_extraction", bind=True, max_retries=2)
def run_profile_extraction(self, candidate_id: str, resume_path: str):
    """Layer 1+2: Parse resume and extract structured profile via llama3.1:8b."""
    try:
        from .services.resume_parser import extract_resume_text
        from .services.profile_extractor import extract_profile
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        text = extract_resume_text(resume_path)
        profile = extract_profile(text)

        async def _save():
            async with AsyncSessionLocal() as db:
                result = await db.get(Candidate, uuid.UUID(candidate_id))
                if result:
                    result.profile_json = profile
                    result.status = "analyzed"
                    await db.commit()

        asyncio.run(_save())
        logger.info(f"Profile extracted for candidate {candidate_id}")
        return {"status": "ok", "candidate_id": candidate_id}
    except Exception as exc:
        logger.error(f"Profile extraction failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_jd_scoring", bind=True, max_retries=2)
def run_jd_scoring(self, candidate_id: str, jd_text: str):
    """Layer 3: Score candidate profile against JD via llama3.1:8b."""
    try:
        from .services.jd_matcher import score_candidate
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        async def _score():
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile yet")

                scores = score_candidate(candidate.profile_json, jd_text)
                candidate.match_score = int(scores.get("overall_score", 0))
                candidate.match_details = scores

                from .services.jd_matcher import should_proceed
                decision = should_proceed(scores)
                if decision == "reject":
                    candidate.status = "rejected"
                elif decision == "review":
                    candidate.status = "pending_review"
                else:
                    candidate.status = "pending"

                await db.commit()
                return scores

        return asyncio.run(_score())
    except Exception as exc:
        logger.error(f"JD scoring failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_question_gen", bind=True, max_retries=2)
def run_question_gen(self, candidate_id: str, jd_text: str):
    """Layer 4: Generate personalised interview questions via llama3.1:8b."""
    try:
        from .services.question_gen import generate_questions
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        async def _gen():
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile")

                questions = generate_questions(candidate.profile_json, jd_text)
                candidate.questions_json = questions
                await db.commit()
                return questions

        return asyncio.run(_gen())
    except Exception as exc:
        logger.error(f"Question generation failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_report_gen", bind=True, max_retries=2)
def run_report_gen(self, call_sid: str):
    """Layer 6: Generate post-call score report via llama3.1:8b."""
    try:
        from .voice.call_state import get_state
        from .services.report_gen import generate_report
        import asyncio
        from .database import AsyncSessionLocal
        from .models.call import ScreeningCall
        from .models.report import ScoreReport
        from .models.candidate import Candidate
        import uuid

        state = get_state(call_sid)

        async def _save():
            async with AsyncSessionLocal() as db:
                call = await db.get(ScreeningCall, uuid.UUID(state["call_id"]))
                candidate = await db.get(Candidate, call.candidate_id)
                report_data = generate_report(state, candidate.profile_json or {})

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
                )
                db.add(report)
                call.status = "completed"
                await db.commit()

        asyncio.run(_save())
        logger.info(f"Report generated for call {call_sid}")
        return {"status": "ok", "call_sid": call_sid}
    except Exception as exc:
        logger.error(f"Report generation failed: {exc}")
        raise self.retry(exc=exc, countdown=15)


@celery.task(name="backend.tasks.send_email_task")
def send_email_task(to_email: str, subject: str, html_content: str):
    from .notifications.email import send_email
    return send_email(to_email, subject, html_content)


@celery.task(name="backend.tasks.send_sms_task")
def send_sms_task(to_phone: str, message: str):
    from .notifications.sms import send_sms
    return send_sms(to_phone, message)
