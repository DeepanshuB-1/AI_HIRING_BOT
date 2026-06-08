from .ollama_client import ollama_chat, INTERVIEW_MODEL


def generate_opening(candidate_name: str, role: str, company: str = "our company") -> str:
    """Layer 5 — generate the first thing the AI says when the candidate picks up."""
    prompt = f"""Generate a warm, natural, professional phone screening introduction. It should sound like a real interviewer — friendly and human, but honest about being AI.

Candidate name: {candidate_name}
Role they applied for: {role}
Company: {company}

Rules:
- Start with a warm greeting using the candidate's first name only (not full name)
- Say you are calling from {company} regarding their application for {role}
- Introduce yourself as "Alex" — an AI interviewer working on behalf of {company}
- Clearly but naturally disclose this is an AI-conducted screening (legal requirement — do not skip)
- Mention the interview will take about 20 to 25 minutes
- Ask if they are in a good place to talk and ready to begin
- Tone: warm, encouraging, not robotic — like a friendly HR person
- Maximum 5 sentences
- Return ONLY the spoken text, no labels, no quotes, no stage directions"""
    return ollama_chat(prompt, model=INTERVIEW_MODEL, expect_json=False, temperature=0.5)


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
    first_name = candidate_name.split()[0]
    role = call_state.get("role", "this role")
    company = call_state.get("company", "the company")

    prompt = f"""Generate a warm, genuine closing statement to end a phone screening interview.

Candidate first name: {first_name}
Role: {role}
Company: {company}

Rules:
- Use first name only, not full name
- Sincerely thank them for their time and answers
- Tell them the {company} HR team will review their screening and reach out within 3 to 5 business days
- Wish them the very best
- Tone: warm, human, encouraging — leave a good impression
- Maximum 3 sentences
- Return ONLY the spoken text"""
    return ollama_chat(prompt, model=INTERVIEW_MODEL, expect_json=False, temperature=0.5)
