from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from .ollama_client import ollama_chat, ANALYSIS_MODEL
from backend.config import settings


async def score_candidate_v2(
    candidate_id: str,
    profile: dict,
    jd_text: str,
    db: AsyncSession,
) -> dict:
    """Layer 3 — two-stage scoring: pgvector cosine (40%) + LLM (60%)."""
    # Stage 1: pgvector cosine similarity between stored resume and JD embeddings
    vec_result = await db.execute(
        text("""
            SELECT ROUND(CAST((1 - (c.resume_embedding <=> j.jd_embedding)) * 100 AS numeric), 1) AS vector_score
            FROM candidates c
            JOIN jobs j ON j.id = c.jd_id
            WHERE c.id = CAST(:cid AS uuid)
              AND c.resume_embedding IS NOT NULL
              AND j.jd_embedding IS NOT NULL
        """),
        {"cid": candidate_id},
    )
    row = vec_result.fetchone()
    vector_score = float(row.vector_score) if row and row.vector_score is not None else 50.0

    # Stage 2: LLM dimensional scoring
    prompt = f"""You are a senior HR recruiter. Score this candidate against the job description across 5 dimensions.
Return ONLY valid JSON with this exact schema:
{{
  "skills_score": 0,
  "experience_score": 0,
  "education_score": 0,
  "project_score": 0,
  "red_flag_penalty": 100,
  "matched_skills": ["list of matching skills"],
  "missing_skills": ["list of required skills candidate lacks"],
  "reasoning": "2-3 sentence summary of the match"
}}

Scoring rules:
- skills_score (0-100): overlap between candidate skills and JD required skills
- experience_score (0-100): years and domain fit
- education_score (0-100): degree level and field match
- project_score (0-100): past projects matching role requirements
- red_flag_penalty (0-100): 100 = no concerns; lower = more red flags (gaps, job hopping)

Candidate Profile: {profile}
Job Description: {jd_text}
"""
    llm_scores = ollama_chat(prompt, model=ANALYSIS_MODEL, expect_json=True, temperature=settings.temp_scoring)

    skills = float(llm_scores.get("skills_score", 0))
    experience = float(llm_scores.get("experience_score", 0))
    education = float(llm_scores.get("education_score", 0))
    project = float(llm_scores.get("project_score", 0))
    red_flag = float(llm_scores.get("red_flag_penalty", 100))

    llm_overall = round(
        skills * 0.30 + experience * 0.25 + education * 0.15 + project * 0.20 + red_flag * 0.10,
        1,
    )

    final_score = round(
        vector_score * settings.vector_similarity_weight
        + llm_overall * settings.llm_score_weight,
        1,
    )

    return {
        **llm_scores,
        "vector_score": vector_score,
        "llm_score": llm_overall,
        "overall_score": final_score,
    }


def should_proceed(score: dict) -> str:
    threshold = settings.auto_reject_threshold
    overall = score.get("overall_score", 0)
    if overall < threshold:
        return "reject"
    elif overall < 60:
        return "review"
    return "proceed"
