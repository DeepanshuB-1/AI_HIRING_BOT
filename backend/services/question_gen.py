import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from .ollama_client import ollama_chat, ANALYSIS_MODEL
from .embedder import embed_text, vec_to_str
from backend.config import settings


def _generate_raw_questions(profile: dict, jd_text: str, count: int) -> list[dict]:
    """LLM-only question generation (no DB, sync)."""
    prompt = f"""You are an expert technical interviewer. Generate {count} interview questions for this candidate applying for the role described below.

RULES (follow strictly):
1. Technical questions MUST focus on skills explicitly required by the Job Description — not every skill on the resume.
2. resume_probe questions must only ask about skills from the candidate's profile that are DIRECTLY relevant to the Job Description. Do NOT probe irrelevant technologies (e.g. do not ask a Backend Python Developer about React or frontend frameworks unless the JD requires it).
3. Include exactly 1 warmup question (easy, open-ended) and 1 closing question.
4. Remaining questions: mix of technical, behavioral, situational, and resume_probe.
5. Match difficulty to seniority implied by the JD.

Return ONLY a valid JSON array. Each item must have exactly these fields:
{{
  "id": <integer starting at 1>,
  "type": "warmup|technical|behavioral|resume_probe|situational|closing",
  "question": "Full question text",
  "difficulty": "easy|medium|hard",
  "ideal_answer_points": ["key point 1", "key point 2"],
  "follow_up": "Follow-up question if the answer is vague"
}}

Job Description (source of truth for what skills matter):
{jd_text}

Candidate Profile (use only to personalise questions, not to determine topic):
{profile}
"""
    result = ollama_chat(prompt, model=ANALYSIS_MODEL, expect_json=True, temperature=settings.temp_question_gen)
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("questions", [])
    return []


async def generate_questions(
    profile: dict,
    jd_text: str,
    jd_id: str,
    db: AsyncSession,
    count: int = 10,
) -> list[dict]:
    """Layer 4 — generate questions with pgvector deduplication against question bank."""
    raw = _generate_raw_questions(profile, jd_text, count + 5)
    threshold = settings.question_dedup_threshold
    unique_questions: list[dict] = []

    for q in raw:
        q_text = q.get("question", "").strip()
        if not q_text:
            continue

        q_vec = embed_text(q_text)
        vec_str = vec_to_str(q_vec)

        # check similarity against existing questions for this JD
        dup_result = await db.execute(
            text("""
                SELECT 1 - (question_embedding <=> CAST(:vec AS vector)) AS similarity
                FROM question_bank
                WHERE jd_id = CAST(:jd_id AS uuid)
                  AND question_embedding IS NOT NULL
                ORDER BY question_embedding <=> CAST(:vec AS vector)
                LIMIT 1
            """),
            {"vec": vec_str, "jd_id": jd_id},
        )
        row = dup_result.fetchone()
        if row and row.similarity >= threshold:
            continue  # too similar to an existing question

        valid_types = {"warmup", "technical", "behavioral", "resume_probe", "situational", "closing"}
        q_type = q.get("type", "technical")
        if q_type not in valid_types:
            q_type = "technical"
        difficulty = q.get("difficulty", "medium")

        await db.execute(
            text("""
                INSERT INTO question_bank
                    (id, jd_id, question_text, question_embedding, question_type, difficulty, pinned, created_at)
                VALUES
                    (CAST(:id AS uuid), CAST(:jd_id AS uuid), :text,
                     CAST(:vec AS vector), CAST(:qtype AS questiontype), CAST(:diff AS difficultylevel), false, NOW())
                ON CONFLICT DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "jd_id": jd_id,
                "text": q_text,
                "vec": vec_str,
                "qtype": q_type,
                "diff": difficulty,
            },
        )

        unique_questions.append(q)
        if len(unique_questions) >= count:
            break

    await db.commit()
    return unique_questions
