from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class JobCreate(BaseModel):
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = "full_time"
    department: Optional[str] = None
    jd_text: str
    required_skills: Optional[List[str]] = None
    min_experience: int = 0
    auto_reject_threshold: int = 40
    question_count: int = 10


class JobOut(BaseModel):
    id: UUID
    hr_user_id: Optional[UUID] = None
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    department: Optional[str] = None
    min_experience: int
    auto_reject_threshold: int
    question_count: int
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class JobDetail(JobOut):
    jd_text: str
    required_skills: Optional[List[str]] = None
