from .ollama_client import ollama_chat, INTERVIEW_MODEL


def generate_opening(candidate_name: str, role: str) -> str:
    """Layer 5 — generate the first thing the AI says when the candidate picks up."""
    prompt = f"""Generate a warm, professional opening for a phone screening interview.

Candidate name: {candidate_name}
Role applying for: {role}

Rules:
- Introduce yourself as "Alex, an AI interviewer" — do NOT pretend to be human
- Explicitly state: "This interview is conducted by an AI system" (legal requirement)
- Welcome them and ask if they can hear clearly and are ready to begin
- Be concise — maximum 4 sentences
- Return ONLY the spoken text, no labels, no quotes"""
    return ollama_chat(prompt, model=INTERVIEW_MODEL, expect_json=False, temperature=0.4)


def generate_next_response(call_state: dict) -> tuple[str, bool]:
    """
    Given current call state, produce the next spoken response.
    Returns (spoken_text, is_closing).
    is_closing=True means the interview is done — trigger report gen after this.
    """
    transcript = call_state.get("transcript", [])
    questions = call_state.get("questions", [])
    q_index = call_state.get("question_index", 0)
    candidate_name = call_state.get("candidate_name", "the candidate")
    role = call_state.get("role", "this role")

    if q_index >= len(questions):
        return generate_closing(call_state), True

    # get next question text (questions_json stores dicts with 'question' key)
    next_q = questions[q_index]
    next_q_text = next_q.get("question", next_q) if isinstance(next_q, dict) else next_q

    # build recent context (last 3 exchanges max to keep prompt short)
    recent = transcript[-6:] if len(transcript) > 6 else transcript
    history = "\n".join(
        f"{'Interviewer' if t['role'] == 'ai' else 'Candidate'}: {t['text']}"
        for t in recent
    )

    prompt = f"""You are Alex, an AI phone interviewer. Continue the interview naturally.

Recent conversation:
{history}

Next question to ask: "{next_q_text}"

Instructions:
- In 1 sentence, briefly acknowledge the candidate's last answer
- Then ask the next question exactly as written
- Keep the total response under 4 sentences
- Return ONLY the spoken text"""

    response = ollama_chat(prompt, model=INTERVIEW_MODEL, expect_json=False, temperature=0.4)
    return response, False


def generate_closing(call_state: dict) -> str:
    """Generate the final thank-you statement when all questions are done."""
    candidate_name = call_state.get("candidate_name", "candidate")
    role = call_state.get("role", "this role")

    prompt = f"""Generate a warm closing statement to end a phone screening interview.

Candidate: {candidate_name}
Role: {role}

Rules:
- Thank them sincerely for their time
- Let them know the HR team will review and be in touch within 3 to 5 business days
- Wish them well
- Maximum 3 sentences
- Return ONLY the spoken text"""
    return ollama_chat(prompt, model=INTERVIEW_MODEL, expect_json=False, temperature=0.4)
