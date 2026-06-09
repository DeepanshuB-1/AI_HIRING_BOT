import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from backend.database import get_db
from backend.config import settings
from backend.models.candidate import Candidate, CandidateStatus
from backend.models.job import Job
from backend.models.call import ScreeningCall, CallStatus
from backend.models.report import ScoreReport
from backend.models.user import User
from backend.schemas.candidate import CandidateCreate, CandidateOut, CandidateDetail
from backend.schemas.job import JobCreate, JobOut, JobDetail
from backend.schemas.search import CandidateSearchResult
from backend.auth import get_current_user
from backend.tasks import (
    run_profile_extraction,
    run_embedding_layer,
    run_jd_scoring,
    run_question_gen,
)

router = APIRouter(prefix="/hr", tags=["HR Admin"])


# ── Jobs ─────────────────────────────────────────────────────────────────────

@router.post("/jobs", response_model=JobOut, status_code=201)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump()
    # Use HR's registered company name if not explicitly provided
    if not data.get("company"):
        data["company"] = current_user.company_name
    job = Job(**data, hr_user_id=current_user.id)
    db.add(job)
    await db.flush()
    return job


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Job)
        .where(Job.hr_user_id == current_user.id)
        .order_by(Job.created_at.desc())
    )
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await db.get(Job, job_id)
    if not job or job.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Candidates: upload + list ────────────────────────────────────────────────

async def _check_duplicate(resume_vec: list[float], db: AsyncSession) -> dict | None:
    """Return the most similar existing candidate if above DUPLICATE_THRESHOLD."""
    from backend.services.embedder import vec_to_str
    vec_str = vec_to_str(resume_vec)
    result = await db.execute(
        text("""
            SELECT id, name, email,
                   1 - (resume_embedding <=> CAST(:vec AS vector)) AS similarity
            FROM candidates
            WHERE resume_embedding IS NOT NULL
            ORDER BY resume_embedding <=> CAST(:vec AS vector)
            LIMIT 1
        """),
        {"vec": vec_str},
    )
    row = result.fetchone()
    if row and row.similarity >= settings.duplicate_threshold:
        return {"id": str(row.id), "name": row.name, "email": row.email, "similarity": row.similarity}
    return None


@router.post("/candidates/upload", response_model=CandidateOut, status_code=201)
async def upload_candidate(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    job_id: uuid.UUID = Form(...),
    source: str = Form("portal"),
    resume: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a candidate resume — triggers Layers 1 → 1.5 → 3 → 4 via Celery."""
    suffix = Path(resume.filename).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Resume must be PDF, DOCX, or TXT")
    if resume.size and resume.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume file too large (max 10 MB)")

    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    upload_path = Path(settings.upload_dir)
    upload_path.mkdir(parents=True, exist_ok=True)
    file_name = f"{uuid.uuid4()}{suffix}"
    file_path = upload_path / file_name
    with file_path.open("wb") as f:
        shutil.copyfileobj(resume.file, f)

    # quick duplicate check (best-effort — skip if embedding fails)
    try:
        from backend.services.resume_parser import extract_resume_text
        from backend.services.embedder import embed_text
        resume_text = extract_resume_text(str(file_path))
        resume_vec = embed_text(resume_text)
        dup = await _check_duplicate(resume_vec, db)
        if dup:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate detected — {dup['similarity']*100:.1f}% similar to {dup['name']} ({dup['email']})",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    candidate = Candidate(
        hr_user_id=current_user.id,
        name=name,
        email=email,
        phone=phone,
        jd_id=job_id,
        resume_url=str(file_path),
        source=source,
        status=CandidateStatus.pending,
    )
    db.add(candidate)
    try:
        await db.flush()
    except IntegrityError:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail=f"A candidate with email {email} already exists")

    cid = str(candidate.id)
    jid = str(job_id)

    # pipeline: Layer 1+2 → Layer 1.5 → Layer 3 → Layer 4
    chain = (
        run_profile_extraction.si(cid, str(file_path))
        | run_embedding_layer.si(cid, str(file_path), jid, job.jd_text)
        | run_jd_scoring.si(cid, job.jd_text)
        | run_question_gen.si(cid, jid, job.jd_text)
    )
    chain.delay()

    return candidate


@router.get("/candidates", response_model=list[CandidateOut])
async def list_candidates(
    status: str | None = None,
    jd_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if status and status not in CandidateStatus.__members__:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid values: {list(CandidateStatus.__members__)}",
        )
    query = (
        select(Candidate, Job.title.label("job_title"))
        .outerjoin(Job, Candidate.jd_id == Job.id)
        .where(Candidate.hr_user_id == current_user.id)
        .order_by(Candidate.created_at.desc())
        .offset(skip).limit(limit)
    )
    if status:
        query = query.where(Candidate.status == status)
    if jd_id:
        query = query.where(Candidate.jd_id == jd_id)
    result = await db.execute(query)
    rows = result.all()
    out = []
    for candidate, job_title in rows:
        d = CandidateOut.model_validate(candidate)
        d.job_title = job_title
        out.append(d)
    return out


# ── pgvector-powered search endpoints (MUST come before /{candidate_id}) ─────

@router.get("/candidates/semantic-search", response_model=list[CandidateSearchResult])
async def semantic_search(
    query: str = Query(..., description="Natural language query to search candidates"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Embed the query and return candidates ranked by cosine similarity."""
    from backend.services.embedder import embed_text, vec_to_str
    query_vec = embed_text(query)
    vec_str = vec_to_str(query_vec)

    result = await db.execute(
        text("""
            SELECT id, name, email, phone, match_score, quick_match_score, status,
                   1 - (resume_embedding <=> CAST(:vec AS vector)) AS similarity_score
            FROM candidates
            WHERE resume_embedding IS NOT NULL
            ORDER BY resume_embedding <=> CAST(:vec AS vector)
            LIMIT :limit
        """),
        {"vec": vec_str, "limit": limit},
    )
    rows = result.fetchall()
    return [
        CandidateSearchResult(
            id=row.id,
            name=row.name,
            email=row.email,
            phone=row.phone,
            match_score=row.match_score,
            quick_match_score=row.quick_match_score,
            similarity_score=round(float(row.similarity_score), 4),
            status=row.status,
        )
        for row in rows
    ]


@router.get("/candidates/similar-to-hires", response_model=list[CandidateSearchResult])
async def similar_to_hires(
    job_id: uuid.UUID | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find pending/reviewed candidates most similar to previously hired candidates."""
    hire_filter = "AND c_hire.jd_id = CAST(:job_id AS uuid)" if job_id else ""
    params: dict = {"limit": limit}
    if job_id:
        params["job_id"] = str(job_id)

    result = await db.execute(
        text(f"""
            WITH hire_centroid AS (
                SELECT AVG(resume_embedding) AS avg_vec
                FROM candidates c_hire
                WHERE c_hire.status = 'completed'
                  AND c_hire.resume_embedding IS NOT NULL
                  {hire_filter}
            )
            SELECT c.id, c.name, c.email, c.phone, c.match_score, c.quick_match_score, c.status,
                   1 - (c.resume_embedding <=> hc.avg_vec) AS similarity_score
            FROM candidates c, hire_centroid hc
            WHERE c.status IN ('pending', 'pending_review', 'analyzed')
              AND c.resume_embedding IS NOT NULL
              AND hc.avg_vec IS NOT NULL
            ORDER BY c.resume_embedding <=> hc.avg_vec
            LIMIT :limit
        """),
        params,
    )
    rows = result.fetchall()
    return [
        CandidateSearchResult(
            id=row.id,
            name=row.name,
            email=row.email,
            phone=row.phone,
            match_score=row.match_score,
            quick_match_score=row.quick_match_score,
            similarity_score=round(float(row.similarity_score), 4),
            status=row.status,
        )
        for row in rows
    ]


@router.get("/candidates/cluster")
async def cluster_candidates(
    job_id: uuid.UUID = Query(..., description="Job ID to cluster candidates for"),
    n_clusters: int = Query(3, ge=2, le=8),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """K-means clustering of candidates by resume embedding (stdlib only, no ML deps)."""
    result = await db.execute(
        text("""
            SELECT id, name, resume_embedding
            FROM candidates
            WHERE jd_id = CAST(:jid AS uuid)
              AND resume_embedding IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 200
        """),
        {"jid": str(job_id)},
    )
    rows = result.fetchall()
    if not rows:
        return {"clusters": [], "message": "No candidates with embeddings for this job"}

    import random
    import math

    ids = [str(row.id) for row in rows]
    names = [row.name for row in rows]
    vecs = [list(row.resume_embedding) for row in rows]

    def _dist(a: list[float], b: list[float]) -> float:
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    k = min(n_clusters, len(vecs))
    centroids = [vecs[random.randrange(len(vecs))]]
    while len(centroids) < k:
        dists = [min(_dist(v, c) for c in centroids) ** 2 for v in vecs]
        total = sum(dists)
        rnd = random.random() * total
        cumulative = 0.0
        for i, d in enumerate(dists):
            cumulative += d
            if cumulative >= rnd:
                centroids.append(vecs[i])
                break

    for _ in range(20):
        assignments = [min(range(k), key=lambda ci: _dist(v, centroids[ci])) for v in vecs]
        new_centroids = []
        for ci in range(k):
            cluster_vecs = [vecs[i] for i, a in enumerate(assignments) if a == ci]
            if cluster_vecs:
                dim = len(cluster_vecs[0])
                new_centroids.append([sum(v[d] for v in cluster_vecs) / len(cluster_vecs) for d in range(dim)])
            else:
                new_centroids.append(centroids[ci])
        if new_centroids == centroids:
            break
        centroids = new_centroids

    clusters = [
        {
            "cluster_id": ci,
            "size": assignments.count(ci),
            "candidate_ids": [ids[i] for i, a in enumerate(assignments) if a == ci],
            "candidate_names": [names[i] for i, a in enumerate(assignments) if a == ci],
        }
        for ci in range(k)
        if assignments.count(ci) > 0
    ]

    return {"job_id": str(job_id), "n_clusters": k, "clusters": clusters}


# ── Schedule view ────────────────────────────────────────────────────────────

@router.get("/schedule")
async def get_schedule(
    date_str: str | None = Query(None, description="Date in YYYY-MM-DD (defaults to today IST)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all scheduled calls for a given day, sorted by time."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo
    from sqlalchemy import and_

    IST = ZoneInfo("Asia/Kolkata")
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    else:
        target_date = datetime.now(IST).date()

    result = await db.execute(
        select(ScreeningCall, Candidate)
        .join(Candidate, ScreeningCall.candidate_id == Candidate.id)
        .where(
            and_(
                ScreeningCall.scheduled_date == target_date,
                ScreeningCall.scheduled_time.isnot(None),
                Candidate.hr_user_id == current_user.id,
                ScreeningCall.status != CallStatus.failed,  # hide cancelled/failed calls
            )
        ).order_by(ScreeningCall.scheduled_time)
    )
    rows_raw = result.all()

    rows = []
    for c, candidate in rows_raw:
        rows.append({
            "call_id": str(c.id),
            "scheduled_time": c.scheduled_time.strftime("%H:%M") if c.scheduled_time else None,
            "status": c.status,
            "candidate_id": str(c.candidate_id),
            "candidate_name": candidate.name,
            "candidate_phone": candidate.phone,
        })

    return {"date": target_date.isoformat(), "total": len(rows), "calls": rows}


# ── Per-candidate endpoints (parameterised — must come AFTER specific paths) ──

@router.get("/candidates/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.patch("/candidates/{candidate_id}/phone", response_model=CandidateOut)
async def update_candidate_phone(
    candidate_id: uuid.UUID,
    phone: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.phone = phone
    await db.commit()
    return candidate


@router.delete("/candidates/{candidate_id}", status_code=204)
async def delete_candidate(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.resume_url:
        Path(candidate.resume_url).unlink(missing_ok=True)
    await db.delete(candidate)
    await db.commit()


@router.get("/candidates/{candidate_id}/report")
async def get_candidate_report(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the post-call score report for a candidate."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")

    result = await db.execute(
        select(ScreeningCall).where(ScreeningCall.candidate_id == candidate_id)
        .order_by(ScreeningCall.created_at.desc())
    )
    call = result.scalars().first()
    if not call:
        raise HTTPException(status_code=404, detail="No screening call found for this candidate")

    report_result = await db.execute(
        select(ScoreReport).where(ScoreReport.call_id == call.id)
    )
    report = report_result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated yet — call may still be processing")

    return {
        "candidate_id": str(candidate_id),
        "call_id": str(call.id),
        "call_status": call.status,
        "call_duration_seconds": call.duration_seconds,
        "transcript": call.transcript,
        "overall_score": report.overall_score,
        "skills_score": report.skills_score,
        "experience_score": report.experience_score,
        "communication_score": report.communication_score,
        "culture_fit_score": report.culture_fit_score,
        "confidence_score": report.confidence_score,
        "ai_recommendation": report.ai_recommendation,
        "ai_reasoning": report.ai_reasoning,
        "red_flags": report.red_flags,
        "strengths": report.strengths,
        "next_round_questions": report.next_round_questions,
        "hr_override": report.hr_override,
        "hr_notes": report.hr_notes,
        "created_at": report.created_at,
    }


@router.post("/candidates/{candidate_id}/decision")
async def submit_decision(
    candidate_id: uuid.UUID,
    decision: str = Body(..., embed=True),
    notes: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HR submits final decision (HIRE/SHORTLIST/HOLD/REJECT) and notifies the candidate by email."""
    from backend.models.report import AIRecommendation
    from backend.tasks import send_email_task
    from backend.notifications.templates import (
        hire_email_html, shortlist_email_html,
        hold_email_html, rejection_email_html,
    )

    decision = decision.upper()
    if decision not in ("HIRE", "SHORTLIST", "HOLD", "REJECT"):
        raise HTTPException(status_code=400, detail="decision must be HIRE, SHORTLIST, HOLD, or REJECT")

    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Update hr_override on the report
    report_result = await db.execute(
        select(ScoreReport)
        .join(ScreeningCall, ScoreReport.call_id == ScreeningCall.id)
        .where(ScreeningCall.candidate_id == candidate_id)
        .order_by(ScoreReport.created_at.desc())
    )
    report = report_result.scalars().first()
    if report:
        report.hr_override = AIRecommendation(decision)
        report.hr_notes = notes or report.hr_notes

    # Update candidate status
    if decision == "REJECT":
        candidate.status = CandidateStatus.rejected
    # HIRE / SHORTLIST / HOLD keep status as "completed" — hr_override carries the decision

    # Cancel any pending scheduled calls — decision is final, no more auto-dialling
    pending_calls_result = await db.execute(
        select(ScreeningCall).where(
            ScreeningCall.candidate_id == candidate_id,
            ScreeningCall.status == CallStatus.pending,
        )
    )
    for sc in pending_calls_result.scalars().all():
        sc.status = CallStatus.failed

    await db.commit()

    # Send decision email to candidate
    job = await db.get(Job, candidate.jd_id) if candidate.jd_id else None
    role = job.title if job else "the applied role"

    if decision == "HIRE":
        subject, html_body = hire_email_html(candidate.name, role, current_user.company_name)
    elif decision == "SHORTLIST":
        subject, html_body = shortlist_email_html(candidate.name, role, current_user.company_name)
    elif decision == "HOLD":
        subject, html_body = hold_email_html(candidate.name, role, current_user.company_name)
    else:
        subject, html_body = rejection_email_html(candidate.name, role, current_user.company_name)

    send_email_task.delay(candidate.email, subject, html_body)

    return {"ok": True, "decision": decision, "email_sent_to": candidate.email}


@router.get("/candidates/{candidate_id}/similar", response_model=list[CandidateSearchResult])
async def find_similar_candidates(
    candidate_id: uuid.UUID,
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find top-N candidates with the most similar resume to the given candidate."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate or candidate.hr_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.resume_embedding is None:
        raise HTTPException(status_code=422, detail="Candidate has no resume embedding yet")

    from backend.services.embedder import vec_to_str
    vec_str = vec_to_str(candidate.resume_embedding)

    result = await db.execute(
        text("""
            SELECT id, name, email, phone, match_score, quick_match_score, status,
                   1 - (resume_embedding <=> CAST(:vec AS vector)) AS similarity_score
            FROM candidates
            WHERE resume_embedding IS NOT NULL
              AND id != CAST(:cid AS uuid)
            ORDER BY resume_embedding <=> CAST(:vec AS vector)
            LIMIT :limit
        """),
        {"vec": vec_str, "cid": str(candidate_id), "limit": limit},
    )
    rows = result.fetchall()
    return [
        CandidateSearchResult(
            id=row.id,
            name=row.name,
            email=row.email,
            phone=row.phone,
            match_score=row.match_score,
            quick_match_score=row.quick_match_score,
            similarity_score=round(float(row.similarity_score), 4),
            status=row.status,
        )
        for row in rows
    ]
