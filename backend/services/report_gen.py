from .ollama_client import ollama_chat, ANALYSIS_MODEL
from .embedder import embed_text


def generate_report(call_state: dict, profile: dict) -> dict:
    """Layer 6 — generate post-call score report via llama3.1:8b."""
    transcript = call_state.get("transcript", [])
    transcript_text = "\n".join(
        f"Q: {t.get('question', '')}\nA: {t.get('answer', '')}"
        for t in transcript
    )

    prompt = f"""You are an expert HR analyst. Analyze this interview and produce a comprehensive score report.
Return ONLY valid JSON with this exact schema:
{{
  "overall_score": 0,
  "skills_score": 0,
  "experience_score": 0,
  "communication_score": 0,
  "culture_fit_score": 0,
  "confidence_score": 0,
  "recommendation": "HIRE|SHORTLIST|HOLD|REJECT",
  "reasoning": "3-4 sentence summary",
  "red_flags": ["list"],
  "strengths": ["list"],
  "next_round_questions": ["3 follow-up questions for next round"]
}}

Candidate Profile: {profile}

Interview Transcript:
{transcript_text}
"""
    return ollama_chat(prompt, model=ANALYSIS_MODEL, expect_json=True)


def _build_report_summary(report: dict) -> str:
    rec = report.get("recommendation", "HOLD")
    score = report.get("overall_score", 0)
    reasoning = report.get("reasoning", "")
    strengths = ", ".join(report.get("strengths", []))
    return f"Recommendation: {rec}. Score: {score}/100. {reasoning} Key strengths: {strengths}"


def generate_report_with_embedding(call_state: dict, profile: dict) -> tuple[dict, list[float]]:
    """Layer 6 — generate report and produce a 768-dim embedding of the summary."""
    report = generate_report(call_state, profile)
    summary = _build_report_summary(report)
    embedding = embed_text(summary)
    return report, embedding
