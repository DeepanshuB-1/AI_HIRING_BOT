from .ollama_client import ollama_stream_voice, INTERVIEW_MODEL
from backend.voice.call_state import update_state


def generate_opening(candidate_name: str, role: str, company: str = "our company") -> str:
    """Layer 5 — fixed template greeting so /voice/start responds instantly (no LLM needed)."""
    first_name = candidate_name.split()[0] if candidate_name else "there"
    return (
        f"Hi {first_name}! I'm Alex, an AI interviewer calling from {company} "
        f"about your application for the {role} position. "
        f"Just so you know upfront, I am an AI — your responses will be reviewed by the HR team. "
        f"This screening will take about 20 to 25 minutes. "
        f"Are you in a good place to talk right now?"
    )


def generate_next_response(call_state: dict) -> tuple[str, bool]:
    """
    Given current call state, produce the next spoken response.
    Returns (spoken_text, is_closing).
    is_closing=True means the interview is done — trigger report gen after this.
    Also updates call_state["recent_openers"] in-place (H1); caller should persist via update_state.
    """
    transcript    = call_state.get("transcript", [])
    questions     = call_state.get("questions", [])
    q_index       = call_state.get("question_index", 0)
    candidate_name = call_state.get("candidate_name", "")
    first_name    = candidate_name.split()[0] if candidate_name else "there"
    recent_openers = call_state.get("recent_openers", [])

    if q_index >= len(questions):
        return generate_closing(call_state), True

    next_q      = questions[q_index]
    next_q_text = next_q.get("question", next_q) if isinstance(next_q, dict) else next_q

    # H1: pass last answer explicitly so the model can reference a concrete detail
    last_answer = next(
        (t["text"] for t in reversed(transcript) if t["role"] == "candidate"), ""
    )

    # last 3 exchanges for context (keep prompt short → faster inference)
    recent  = transcript[-6:] if len(transcript) > 6 else transcript
    history = "\n".join(
        f"{'Interviewer' if t['role'] == 'ai' else 'Candidate'}: {t['text']}"
        for t in recent
    )

    total_questions = len(questions)
    halfway         = total_questions // 2

    # H1: progress markers
    progress_hint = ""
    if q_index == halfway:
        progress_hint = "- We're about halfway through — mention this naturally in one short phrase.\n"
    elif q_index == total_questions - 1:
        progress_hint = "- This is the last question — signal it naturally (e.g. 'Last one for you').\n"

    # H1: name usage — every third question
    name_hint = ""
    if q_index > 0 and q_index % 3 == 0:
        name_hint = f"- You may use the candidate's first name ({first_name}) once in your reply.\n"

    # H4: warm beat on the very first question
    first_q_hint = ""
    if q_index == 0:
        first_q_hint = (
            f"- This is the first question — open with one brief warm line "
            f"acknowledging they're ready (e.g. 'Perfect, thanks {first_name}.') before asking.\n"
        )

    # H1: avoid repeating recent openers
    avoid_openers = ", ".join(f'"{o}"' for o in recent_openers) if recent_openers else "none"

    prompt = f"""You are Alex, a warm and patient AI phone interviewer. Continue the conversation naturally.

Recent conversation:
{history}

Their last answer: "{last_answer}"

Next question to ask: "{next_q_text}"

Instructions:
- Start by reacting to ONE concrete detail from their answer in your own words (a technology, a number, a project, a decision they mentioned). Example shape: "Six months migrating that Django service — that's hands-on."
- NEVER use generic praise: banned phrases include 'insightful', 'great point', 'that's really helpful', 'good to know', 'interesting'.
- Do not start with the same word you used last time. Avoid these recent openers: {avoid_openers}
- Then bridge to the next question in one short, natural clause.
- Contractions always (I'm, that's, you've). Short sentences. Plain spoken English — this will be read aloud by TTS. No lists, no markdown, no quotes.
{first_q_hint}{name_hint}{progress_hint}- Ask the question clearly and in full — do NOT cut it short.
- Keep total response under 4 sentences.
- Return ONLY the spoken text, no labels, no quotes."""

    response = ollama_stream_voice(prompt, temperature=0.6, max_sentences=4)

    # H1: update recent_openers in-place (caller persists via update_state)
    words   = response.split()
    opener  = " ".join(words[:3]) if len(words) >= 3 else response
    updated = (recent_openers + [opener])[-3:]
    call_state["recent_openers"] = updated

    return response, False


def generate_followup_probe(call_state: dict, q_index: int) -> str:
    """H4: Generate a single probing follow-up — empathetic when the answer is short/vague."""
    transcript = call_state.get("transcript", [])
    questions  = call_state.get("questions", [])

    q      = questions[q_index] if q_index < len(questions) else {}
    q_text = q.get("question", q) if isinstance(q, dict) else str(q)

    last_answer = next(
        (t["text"] for t in reversed(transcript) if t["role"] == "candidate"), ""
    )

    prompt = f"""You are Alex, a warm AI phone interviewer. The candidate just gave a brief answer and you want to gently draw out more detail before moving on.

Question asked: "{q_text}"
Candidate's answer so far: "{last_answer}"

Instructions:
- If the answer suggests difficulty or hesitation, open with a brief empathetic line ('No worries, take your time.') before the probe; never sound like an interrogation.
- Otherwise, briefly acknowledge their answer (e.g. "Thanks for that." / "Got it.")
- Ask ONE specific follow-up probe — for example: "Could you give me a quick example?", "Can you walk me through that a bit more?", "What was the outcome there?"
- Maximum 2 sentences, warm and encouraging tone
- Return ONLY the spoken text, no labels"""
    return ollama_stream_voice(prompt, temperature=0.5, max_sentences=2)


def generate_closing(call_state: dict, ended_early: bool = False) -> str:
    """H4: Warm closing that references something the candidate actually said."""
    candidate_name = call_state.get("candidate_name", "candidate")
    first_name     = candidate_name.split()[0]
    role           = call_state.get("role", "this role")
    company        = call_state.get("company", "the company")
    transcript     = call_state.get("transcript", [])

    # H4: pick the two longest candidate answers so the closing can reference real content
    candidate_answers = [t["text"] for t in transcript if t.get("role") == "candidate"]
    top_answers       = sorted(candidate_answers, key=len, reverse=True)[:2]
    answers_text      = "\n".join(f"- {a}" for a in top_answers) if top_answers else "- (no answers recorded)"

    # Check ended_early from state if not explicitly passed
    if not ended_early:
        ended_early = call_state.get("ended_early", False)

    early_note = (
        "Note: the interview ended a bit early due to time — "
        "reassure the candidate warmly that the answers they gave are fully sufficient for review.\n"
        if ended_early else ""
    )

    prompt = f"""Generate a warm, genuine closing statement to end a phone screening interview.

Candidate first name: {first_name}
Role: {role}
Company: {company}

Sample answers the candidate gave:
{answers_text}

Rules:
- Use first name only, not full name
- Reference ONE specific thing the candidate talked about so they know a real review happened (e.g. 'Loved hearing about the inventory dashboard you built').
- Sincerely thank them for their time and answers
- Tell them the {company} HR team will review their screening and reach out within 3 to 5 business days
- Wish them the very best
- Tone: warm, human, encouraging — leave a good impression
{early_note}- Maximum 3 sentences
- Return ONLY the spoken text"""
    return ollama_stream_voice(prompt, temperature=0.5, max_sentences=3)
