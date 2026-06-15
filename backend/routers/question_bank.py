import uuid
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.question_bank import QuestionBank, QuestionType, DifficultyLevel
from backend.models.job import Job
from backend.models.user import User
from backend.auth import get_current_user

router = APIRouter(prefix="/hr", tags=["Question Bank"])


@router.get("/jobs/{job_id}/questions")
async def list_questions(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all questions in the bank for a job (pinned first)."""
    job = await db.get(Job, job_id)
    if not job or job.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    result = await db.execute(
        select(QuestionBank)
        .where(QuestionBank.jd_id == job_id)
        .order_by(QuestionBank.pinned.desc(), QuestionBank.created_at.asc())
    )
    questions = result.scalars().all()
    return [
        {
            "id": str(q.id),
            "question_text": q.question_text,
            "question_type": q.question_type,
            "difficulty": q.difficulty,
            "pinned": q.pinned,
            "created_at": q.created_at,
        }
        for q in questions
    ]


@router.post("/jobs/{job_id}/questions", status_code=201)
async def add_question(
    job_id: uuid.UUID,
    question_text: str = Body(..., embed=True),
    question_type: str = Body("technical", embed=True),
    difficulty: str = Body("medium", embed=True),
    pinned: bool = Body(False, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a custom question to the bank for a job."""
    job = await db.get(Job, job_id)
    if not job or job.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    valid_types = {t.value for t in QuestionType}
    if question_type not in valid_types:
        question_type = "technical"
    valid_diffs = {d.value for d in DifficultyLevel}
    if difficulty not in valid_diffs:
        difficulty = "medium"

    from backend.services.embedder import embed_text
    q_vec = embed_text(question_text)

    q = QuestionBank(
        jd_id=job_id,
        question_text=question_text,
        question_embedding=q_vec,
        question_type=QuestionType(question_type),
        difficulty=DifficultyLevel(difficulty),
        pinned=pinned,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return {"id": str(q.id), "question_text": q.question_text, "pinned": q.pinned}


@router.patch("/questions/{question_id}")
async def update_question(
    question_id: uuid.UUID,
    question_text: str | None = Body(None, embed=True),
    pinned: bool | None = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit question text or toggle pinned status."""
    q = await db.get(QuestionBank, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Verify ownership via job
    job = await db.get(Job, q.jd_id) if q.jd_id else None
    if not job or job.hr_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if question_text is not None:
        q.question_text = question_text
        from backend.services.embedder import embed_text
        q.question_embedding = embed_text(question_text)
    if pinned is not None:
        q.pinned = pinned

    await db.commit()
    return {"id": str(q.id), "question_text": q.question_text, "pinned": q.pinned}


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a question from the bank."""
    q = await db.get(QuestionBank, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    job = await db.get(Job, q.jd_id) if q.jd_id else None
    if not job or job.hr_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    await db.delete(q)
    await db.commit()
