from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime
from backend.models.candidate import CandidateStatus


class CandidateCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    jd_id: Optional[UUID] = None
    source: Optional[str] = "portal"


class CandidateOut(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str
    jd_id: Optional[UUID] = None
    status: CandidateStatus
    match_score: Optional[int] = None
    quick_match_score: Optional[float] = None
    source: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateDetail(CandidateOut):
    resume_url: Optional[str] = None
    profile_json: Optional[dict] = None
    match_details: Optional[dict] = None
    questions_json: Optional[list] = None
    vector_score: Optional[float] = None
    llm_score: Optional[float] = None
    consent_given: bool = False
