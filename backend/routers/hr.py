import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.config import settings
from backend.models.candidate import Candidate, CandidateStatus
from backend.models.job import Job
from backend.schemas.candidate import CandidateCreate, CandidateOut, CandidateDetail
from backend.schemas.job import JobCreate, JobOut, JobDetail
from backend.tasks import run_profile_extraction, run_jd_scoring, run_question_gen

router = APIRouter(prefix="/hr", tags=["HR Admin"])


# ── Jobs ─────────────────────────────────────────────────────────────────────

@router.post("/jobs", response_model=JobOut, status_code=201)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)):
    job = Job(**payload.model_dump())
    db.add(job)
    await db.flush()
    return job


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Candidates ────────────────────────────────────────────────────────────────

@router.post("/candidates/upload", response_model=CandidateOut, status_code=201)
async def upload_candidate(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    job_id: uuid.UUID = Form(...),
    source: str = Form("portal"),
    resume: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a candidate resume — triggers Layers 1-3 in background via Celery."""
    # validate file type
    suffix = Path(resume.filename).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Resume must be PDF, DOCX, or TXT")

    # check job exists
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # save file
    upload_path = Path(settings.upload_dir)
    upload_path.mkdir(parents=True, exist_ok=True)
    file_name = f"{uuid.uuid4()}{suffix}"
    file_path = upload_path / file_name
    with file_path.open("wb") as f:
        shutil.copyfileobj(resume.file, f)

    # create candidate record
    candidate = Candidate(
        name=name,
        email=email,
        phone=phone,
        jd_id=job_id,
        resume_url=str(file_path),
        source=source,
        status=CandidateStatus.pending,
    )
    db.add(candidate)
    await db.flush()

    candidate_id = str(candidate.id)

    # kick off background pipeline: Layer 1+2 → then Layer 3
    chain = (
        run_profile_extraction.si(candidate_id, str(file_path))
        | run_jd_scoring.si(candidate_id, job.jd_text)
        | run_question_gen.si(candidate_id, job.jd_text)
    )
    chain.delay()

    return candidate


@router.get("/candidates", response_model=list[CandidateOut])
async def list_candidates(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Candidate).order_by(Candidate.created_at.desc())
    if status:
        query = query.where(Candidate.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/candidates/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.delete("/candidates/{candidate_id}", status_code=204)
async def delete_candidate(candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    await db.delete(candidate)
