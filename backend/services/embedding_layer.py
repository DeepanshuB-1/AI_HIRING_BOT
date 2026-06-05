import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from .embedder import embed_text, cosine_similarity
from backend.models.candidate import Candidate
from backend.models.job import Job


async def generate_and_store_embeddings(
    candidate_id: str,
    resume_text: str,
    jd_id: str,
    jd_text: str,
    db: AsyncSession,
) -> float:
    """Layer 1.5 — embed resume + JD, persist vectors, return quick cosine score."""
    resume_vec = embed_text(resume_text)
    jd_vec = embed_text(jd_text)

    quick_score = round(cosine_similarity(resume_vec, jd_vec) * 100, 1)

    cand = await db.get(Candidate, uuid.UUID(candidate_id))
    if cand:
        cand.resume_embedding = resume_vec
        cand.quick_match_score = quick_score

    # store JD embedding once (idempotent)
    job = await db.get(Job, uuid.UUID(jd_id))
    if job and job.jd_embedding is None:
        job.jd_embedding = jd_vec

    await db.commit()
    return quick_score
