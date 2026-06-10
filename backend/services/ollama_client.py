import ollama
import json
import re
from backend.config import settings

ANALYSIS_MODEL  = settings.ollama_analysis_model   # llama3.1:8b  — Layers 2,3,4,6
INTERVIEW_MODEL = settings.ollama_interview_model  # mistral:7b   — Layer 5 (voice)

# Single client with a 3-minute timeout so a slow model never hangs the process
_client = ollama.Client(host=settings.ollama_base_url, timeout=180)


def ollama_chat(
    prompt: str,
    model: str = ANALYSIS_MODEL,
    expect_json: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> str | dict:
    """Send a prompt to Ollama and return the response text or parsed JSON."""
    response = _client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        options={
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    )
    text = response["message"]["content"].strip()
    if expect_json:
        return extract_json(text, prompt=prompt, model=model, temperature=temperature)
    return text


def extract_json(text: str, *, prompt: str = "", model: str = "", temperature: float = 0.3) -> dict | list:
    """Strip markdown fences and parse JSON from LLM output. Retries once if parsing fails."""
    def _try_parse(s: str):
        clean = re.sub(r"```(?:json)?\n?", "", s).replace("```", "").strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            match = re.search(r"(\{.*\}|\[.*\])", clean, re.DOTALL)
            if match:
                return json.loads(match.group(1))
        return None

    result = _try_parse(text)
    if result is not None:
        return result

    # First attempt failed — retry with explicit JSON-only instruction
    if prompt and model:
        retry_prompt = (
            prompt
            + "\n\nYour previous response was not valid JSON. "
            "Return ONLY the JSON object or array with no other text, no markdown fences."
        )
        try:
            retry_resp = _client.chat(
                model=model,
                messages=[{"role": "user", "content": retry_prompt}],
                options={"temperature": 0.1, "num_predict": 2048},
            )
            retry_text = retry_resp["message"]["content"].strip()
            result = _try_parse(retry_text)
            if result is not None:
                return result
        except Exception:
            pass

    raise ValueError(f"Could not parse JSON from LLM output:\n{text[:300]}")


def ollama_stream_voice(
    prompt: str,
    temperature: float = 0.5,
    max_sentences: int = 4,
) -> str:
    """
    Stream Layer-5 voice responses from mistral:7b and stop after max_sentences.
    Returns the collected text without waiting for the full generation to finish.
    Cuts perceived latency by ~40% for short spoken responses.
    """
    buffer = ""
    for chunk in _client.chat(
        model=INTERVIEW_MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        options={"temperature": temperature, "num_predict": 256},
    ):
        token = chunk.get("message", {}).get("content", "")
        if token:
            buffer += token
        if chunk.get("done"):
            break
        # Stop once we have enough complete sentences
        if len(re.findall(r"[.!?][\s\n]", buffer)) >= max_sentences:
            break
    return buffer.strip()
