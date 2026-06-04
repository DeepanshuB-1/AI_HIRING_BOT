from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from backend.models.report import AIRecommendation


class ReportOut(BaseModel):
    id: UUID
    call_id: UUID
    overall_score: int
    skills_score: int
    experience_score: int
    communication_score: int
    culture_fit_score: int
    confidence_score: int
    ai_recommendation: AIRecommendation
    ai_reasoning: Optional[str] = None
    red_flags: Optional[List[str]] = None
    strengths: Optional[List[str]] = None
    next_round_questions: Optional[List[str]] = None
    hr_override: Optional[AIRecommendation] = None
    hr_notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HROverride(BaseModel):
    override: AIRecommendation
    notes: str
