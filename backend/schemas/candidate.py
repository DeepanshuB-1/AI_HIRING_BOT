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
    status: CandidateStatus
    match_score: Optional[int] = None
    source: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateDetail(CandidateOut):
    profile_json: Optional[dict] = None
    match_details: Optional[dict] = None
    questions_json: Optional[list] = None
    consent_given: bool = False
