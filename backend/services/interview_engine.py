from .ollama_client import ollama_stream_voice, INTERVIEW_MODEL


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
    return ollama_stream_voice(prompt, temperature=0.5, max_sentences=5)


def generate_next_response(call_state: dict) -> tuple[str, bool]:
    """
    Given current call state, produce the next spoken response.
    Returns (spoken_text, is_closing).
    is_closing=True means the interview is done — trigger report gen after this.
    """
    transcript = call_state.get("transcript", [])
    questions = call_state.get("questions", [])
    q_index = call_state.get("question_index", 0)

    if q_index >= len(questions):
        return generate_closing(call_state), True

    next_q = questions[q_index]
    next_q_text = next_q.get("question", next_q) if isinstance(next_q, dict) else next_q

    # last 3 exchanges for context (keep prompt short → faster inference)
    recent = transcript[-6:] if len(transcript) > 6 else transcript
    history = "\n".join(
        f"{'Interviewer' if t['role'] == 'ai' else 'Candidate'}: {t['text']}"
        for t in recent
    )

    prompt = f"""You are Alex, a warm and patient AI phone interviewer. Continue the conversation naturally.

Recent conversation:
{history}

Next question to ask: "{next_q_text}"

Instructions:
- In 1 short sentence, genuinely acknowledge the candidate's last answer (vary your acknowledgment — use phrases like "That's really helpful", "Great point", "I appreciate you sharing that", "Good to know", "Thanks for walking me through that" — don't always say the same thing)
- Then transition naturally into the next question (e.g., "Moving on...", "Next I'd like to ask...", "Let's talk about...")
- Ask the question clearly and in full — do NOT cut it short
- Keep total response under 4 sentences
- Sound human and conversational, not robotic
- Return ONLY the spoken text, no labels, no quotes"""

    response = ollama_stream_voice(prompt, temperature=0.6, max_sentences=4)
    return response, False


def generate_followup_probe(call_state: dict, q_index: int) -> str:
    """Generate a single probing follow-up when the candidate's answer is too short/vague."""
    transcript = call_state.get("transcript", [])
    questions = call_state.get("questions", [])

    q = questions[q_index] if q_index < len(questions) else {}
    q_text = q.get("question", q) if isinstance(q, dict) else str(q)

    last_answer = next(
        (t["text"] for t in reversed(transcript) if t["role"] == "candidate"), ""
    )

    prompt = f"""You are Alex, a warm AI phone interviewer. The candidate just gave a brief answer and you want to gently draw out more detail before moving on.

Question asked: "{q_text}"
Candidate's answer so far: "{last_answer}"

Instructions:
- Briefly acknowledge their answer (e.g. "Thanks for that." / "Got it.")
- Ask ONE specific follow-up probe — for example: "Could you give me a quick example?", "Can you walk me through that a bit more?", "What was the outcome there?"
- Maximum 2 sentences, warm and encouraging tone
- Return ONLY the spoken text, no labels"""
    return ollama_stream_voice(prompt, temperature=0.5, max_sentences=2)


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
    return ollama_stream_voice(prompt, temperature=0.5, max_sentences=3)
