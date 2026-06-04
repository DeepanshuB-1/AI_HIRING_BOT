import ollama
import json
import re
from backend.config import settings

ANALYSIS_MODEL = settings.ollama_analysis_model   # llama3.1:8b — Layers 2,3,4,6
INTERVIEW_MODEL = settings.ollama_interview_model  # mistral:7b  — Layer 5


def ollama_chat(
    prompt: str,
    model: str = ANALYSIS_MODEL,
    expect_json: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> str | dict:
    """Send a prompt to Ollama and return the response text or parsed JSON."""
    response = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        options={
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    )
    text = response["message"]["content"].strip()
    if expect_json:
        return extract_json(text)
    return text


def extract_json(text: str) -> dict | list:
    """Strip markdown fences and parse JSON from LLM output."""
    clean = re.sub(r"```(?:json)?\n?", "", text).replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # find the first JSON object or array in the text
        match = re.search(r"(\{.*\}|\[.*\])", clean, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise ValueError(f"Could not parse JSON from LLM output:\n{text[:300]}")
