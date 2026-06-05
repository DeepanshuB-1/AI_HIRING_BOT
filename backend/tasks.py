from .celery_app import celery
import logging

logger = logging.getLogger(__name__)


@celery.task(name="backend.tasks.run_profile_extraction", bind=True, max_retries=2)
def run_profile_extraction(self, candidate_id: str, resume_path: str):
    """Layer 1+2: Parse resume, extract structured profile, store profile_embedding."""
    try:
        from .services.resume_parser import extract_resume_text
        from .services.profile_extractor import extract_profile_with_embedding
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        text = extract_resume_text(resume_path)
        profile, profile_embedding = extract_profile_with_embedding(text)

        async def _save():
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if candidate:
                    candidate.profile_json = profile
                    candidate.profile_embedding = profile_embedding
                    candidate.status = "analyzed"
                    await db.commit()

        asyncio.run(_save())
        logger.info(f"Profile extracted for candidate {candidate_id}")
        return {"status": "ok", "candidate_id": candidate_id}
    except Exception as exc:
        logger.error(f"Profile extraction failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_embedding_layer", bind=True, max_retries=2)
def run_embedding_layer(self, candidate_id: str, resume_path: str, jd_id: str, jd_text: str):
    """Layer 1.5: Generate resume + JD embeddings, store in pgvector."""
    try:
        from .services.resume_parser import extract_resume_text
        from .services.embedding_layer import generate_and_store_embeddings
        import asyncio
        from .database import AsyncSessionLocal

        resume_text = extract_resume_text(resume_path)

        async def _embed():
            async with AsyncSessionLocal() as db:
                score = await generate_and_store_embeddings(
                    candidate_id, resume_text, jd_id, jd_text, db
                )
                return score

        quick_score = asyncio.run(_embed())
        logger.info(f"Embeddings stored for candidate {candidate_id} — quick score: {quick_score}")
        return {"status": "ok", "quick_score": quick_score}
    except Exception as exc:
        logger.error(f"Embedding layer failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_jd_scoring", bind=True, max_retries=2)
def run_jd_scoring(self, candidate_id: str, jd_text: str):
    """Layer 3: Two-stage scoring — pgvector cosine (40%) + LLM (60%)."""
    try:
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        async def _score():
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile yet")

                from .services.jd_matcher import score_candidate_v2, should_proceed
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
                    candidate.status = "pending"

                await db.commit()
                return scores

        return asyncio.run(_score())
    except Exception as exc:
        logger.error(f"JD scoring failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_question_gen", bind=True, max_retries=2)
def run_question_gen(self, candidate_id: str, jd_id: str, jd_text: str):
    """Layer 4: Generate personalised questions with pgvector deduplication."""
    try:
        import asyncio
        from .database import AsyncSessionLocal
        from .models.candidate import Candidate
        import uuid

        async def _gen():
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                if not candidate or not candidate.profile_json:
                    raise ValueError(f"Candidate {candidate_id} has no profile")

                from .services.question_gen import generate_questions
                questions = await generate_questions(
                    candidate.profile_json, jd_text, jd_id, db
                )
                candidate.questions_json = questions
                await db.commit()
                return questions

        return asyncio.run(_gen())
    except Exception as exc:
        logger.error(f"Question generation failed: {exc}")
        raise self.retry(exc=exc, countdown=10)


@celery.task(name="backend.tasks.run_report_gen", bind=True, max_retries=2)
def run_report_gen(self, call_sid: str):
    """Layer 6: Generate post-call score report and store report_embedding."""
    try:
        from .voice.call_state import get_state
        from .services.report_gen import generate_report_with_embedding
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
