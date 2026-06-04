from .ollama_client import ollama_chat, ANALYSIS_MODEL


def extract_profile(resume_text: str) -> dict:
    """Layer 2 — extract structured JSON candidate profile via llama3.1:8b."""
    prompt = f"""You are an expert HR analyst. Extract a structured JSON profile from the resume below.
Return ONLY valid JSON — no explanation, no markdown fences.

Required JSON schema:
{{
  "name": "string",
  "email": "string",
  "phone": "string",
  "skills": ["list of technical and soft skills"],
  "experience_years": 0,
  "roles": [
    {{"title": "string", "company": "string", "duration": "string", "responsibilities": ["string"]}}
  ],
  "education": [
    {{"degree": "string", "institution": "string", "year": "string"}}
  ],
  "projects": [
    {{"name": "string", "tech_stack": ["string"], "description": "string"}}
  ],
  "certifications": ["string"],
  "employment_gaps": [
    {{"period": "string", "duration": "string"}}
  ],
  "strengths": ["top 3 strengths"],
  "red_flags": ["list of concerns"],
  "languages": ["spoken or programming languages"]
}}

Resume:
{resume_text}
"""
    return ollama_chat(prompt, model=ANALYSIS_MODEL, expect_json=True)
