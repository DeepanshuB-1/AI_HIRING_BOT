import uuid
import shutil
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from pydantic import BaseModel
from typing import Optional
from jose import JWTError, jwt

from backend.database import get_db
from backend.config import settings
from backend.models.candidate_user import CandidateUser
from backend.models.candidate import Candidate, CandidateStatus
from backend.models.job import Job
from backend.auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/portal", tags=["Candidate Portal"])

_candidate_scheme = OAuth2PasswordBearer(tokenUrl="/api/portal/auth/login", auto_error=False)


async def get_current_candidate(
    token: str = Depends(_candidate_scheme),
    db: AsyncSession = Depends(get_db),
) -> CandidateUser:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please log in to continue.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc
    candidate = await db.get(CandidateUser, uuid.UUID(user_id))
    if not candidate:
        raise exc
    return candidate


async def get_optional_candidate(
    token: str = Depends(_candidate_scheme),
    db: AsyncSession = Depends(get_db),
) -> CandidateUser | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return await db.get(CandidateUser, uuid.UUID(user_id))
    except JWTError:
        return None


# ── Schemas ───────────────────────────────────────────────────────────────────

class CandidateRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None

    class Config:
        str_strip_whitespace = True


class CandidateLoginRequest(BaseModel):
    email: str
    password: str


class CandidateUserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class CandidateTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: CandidateUserOut


class PublicJobOut(BaseModel):
    id: uuid.UUID
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    department: Optional[str] = None
    min_experience: int
    created_at: datetime
    model_config = {"from_attributes": True}


class PublicJobDetail(PublicJobOut):
    jd_text: str
    required_skills: Optional[list] = None


class ApplicationOut(BaseModel):
    id: uuid.UUID
    job_title: str
    company: Optional[str]
    status: str
    match_score: Optional[int]
    applied_at: datetime
    model_config = {"from_attributes": True}


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/register", response_model=CandidateTokenOut, status_code=201)
async def candidate_register(payload: CandidateRegisterRequest, db: AsyncSession = Depends(get_db)):
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    existing = await db.execute(select(CandidateUser).where(CandidateUser.email == payload.email.lower()))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = CandidateUser(
        name=payload.name.strip(),
        email=payload.email.lower().strip(),
        password_hash=hash_password(payload.password),
        phone=payload.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return CandidateTokenOut(access_token=token, user=CandidateUserOut.model_validate(user))


@router.post("/auth/login", response_model=CandidateTokenOut)
async def candidate_login(payload: CandidateLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CandidateUser).where(CandidateUser.email == payload.email.lower().strip()))
    user = result.scalars().first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(str(user.id))
    return CandidateTokenOut(access_token=token, user=CandidateUserOut.model_validate(user))


@router.get("/auth/me", response_model=CandidateUserOut)
async def candidate_me(current: CandidateUser = Depends(get_current_candidate)):
    return current


# ── Public Job Board ──────────────────────────────────────────────────────────

@router.get("/jobs", response_model=list[PublicJobOut])
async def public_jobs(db: AsyncSession = Depends(get_db)):
    """Public job board — no auth required."""
    result = await db.execute(
        select(Job)
        .where(Job.is_active.is_(True))
        .order_by(Job.created_at.desc())
    )
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=PublicJobDetail)
async def public_job_detail(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job or not job.is_active:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Apply ─────────────────────────────────────────────────────────────────────

@router.post("/apply/{job_id}", status_code=201)
async def apply_to_job(
    job_id: uuid.UUID,
    resume: UploadFile = File(...),
    phone: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current: CandidateUser = Depends(get_current_candidate),
):
    """Authenticated candidate submits their resume for a job."""
    # Validate file type
    suffix = Path(resume.filename or "").suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Resume must be a PDF, DOCX, or TXT file")

    # Validate file size (10 MB cap) — read first chunk to get size without loading all into memory
    contents = await resume.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume file too large (max 10 MB)")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Resume file is empty")
    await resume.seek(0)

    # Sanitise phone: strip spaces/dashes, must be at least 7 digits
    phone_clean = "".join(c for c in phone.strip() if c.isdigit() or c == "+")
    digits_only = "".join(c for c in phone_clean if c.isdigit())
    if len(digits_only) < 7:
        raise HTTPException(status_code=422, detail="Please enter a valid phone number")

    job = await db.get(Job, job_id)
    if not job or not job.is_active:
        raise HTTPException(status_code=404, detail="Job not found or no longer accepting applications")

    # Check for duplicate application (same email, same job)
    existing = await db.execute(
        select(Candidate).where(
            Candidate.email == current.email,
            Candidate.jd_id == job_id,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="You have already applied to this position")

    # Save resume file
    upload_dir = Path(settings.upload_dir) / str(job_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}{suffix}"
    file_path = upload_dir / safe_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(resume.file, f)

    # Update candidate user's phone if provided
    if phone_clean and not current.phone:
        current.phone = phone_clean

    # Create Candidate pipeline record
    candidate = Candidate(
        name=current.name,
        email=current.email,
        phone=phone_clean or current.phone or "",
        resume_url=str(file_path),
        jd_id=job_id,
        hr_user_id=job.hr_user_id,
        status=CandidateStatus.pending,
        source="portal",
    )
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)

    # Auto-trigger AI pipeline
    from backend.tasks import (
        run_profile_extraction,
        run_embedding_layer,
        run_jd_scoring,
        run_question_gen,
    )
    chain = (
        run_profile_extraction.si(str(candidate.id), str(file_path))
        | run_embedding_layer.si(str(candidate.id), str(file_path), str(job_id), job.jd_text)
        | run_jd_scoring.si(str(candidate.id), job.jd_text)
        | run_question_gen.si(str(candidate.id), str(job_id), job.jd_text)
    )
    chain.delay()

    return {
        "message": "Application submitted successfully! We'll be in touch soon.",
        "candidate_id": str(candidate.id),
        "job_title": job.title,
        "company": job.company or settings.company_name,
    }


# ── My Applications ───────────────────────────────────────────────────────────

@router.get("/my-applications")
async def my_applications(
    db: AsyncSession = Depends(get_db),
    current: CandidateUser = Depends(get_current_candidate),
):
    """Return all jobs this candidate has applied to."""
    result = await db.execute(
        select(Candidate, Job)
        .join(Job, Candidate.jd_id == Job.id, isouter=True)
        .where(func.lower(Candidate.email) == current.email.lower().strip())
        .order_by(Candidate.created_at.desc())
    )
    rows = result.all()

    return [
        {
            "id": str(c.id),
            "jd_id": str(c.jd_id) if c.jd_id else None,
            "job_title": j.title if j else "Unknown Position",
            "company": (j.company if j else None) or settings.company_name,
            "location": j.location if j else None,
            "status": c.status.value,
            "match_score": c.match_score,
            "applied_at": c.created_at.isoformat(),
        }
        for c, j in rows
    ]
