from .ollama_client import ollama_chat, ANALYSIS_MODEL
from backend.config import settings


def score_candidate(profile: dict, jd_text: str) -> dict:
    """Layer 3 — score candidate against JD across 5 dimensions via llama3.1:8b.

    Weights: skills 30%, experience 25%, project 20%, education 15%, red_flags 10%
    """
    prompt = f"""You are a senior HR recruiter. Score this candidate against the job description.
Return ONLY valid JSON with this exact schema:
{{
  "skills_score": 0,
  "experience_score": 0,
  "education_score": 0,
  "project_score": 0,
  "red_flag_penalty": 100,
  "overall_score": 0,
  "matched_skills": ["list of matching skills"],
  "missing_skills": ["list of required skills candidate lacks"],
  "reasoning": "2-3 sentence summary of the match"
}}

Scoring rules:
- skills_score (0-100): overlap between candidate skills and JD required skills
- experience_score (0-100): years of experience, seniority, domain fit
- education_score (0-100): degree level, institution relevance, field match
- project_score (0-100): past projects matching role requirements
- red_flag_penalty (0-100): 100 = no penalty, lower = more concerns (gaps, job hopping, inconsistencies)
- overall_score = (skills*0.30 + experience*0.25 + project*0.20 + education*0.15 + red_flag_penalty*0.10)

Candidate Profile: {profile}

Job Description: {jd_text}
"""
    return ollama_chat(prompt, model=ANALYSIS_MODEL, expect_json=True)


def should_proceed(score: dict) -> str:
    """Return 'reject', 'review', or 'proceed' based on overall score."""
    threshold = settings.auto_reject_threshold
    overall = score.get("overall_score", 0)

    if overall < threshold:
        return "reject"
    elif overall < 60:
        return "review"
    return "proceed"
