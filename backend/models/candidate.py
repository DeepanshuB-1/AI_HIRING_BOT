import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base
import enum


class CandidateStatus(str, enum.Enum):
    pending = "pending"
    analyzed = "analyzed"
    pending_review = "pending_review"
    scheduled = "scheduled"
    in_call = "in_call"
    completed = "completed"
    rejected = "rejected"


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    resume_url: Mapped[str | None] = mapped_column(Text)
    jd_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    profile_json: Mapped[dict | None] = mapped_column(JSONB)
    match_score: Mapped[int | None] = mapped_column(Integer)
    match_details: Mapped[dict | None] = mapped_column(JSONB)
    questions_json: Mapped[list | None] = mapped_column(JSONB)
    status: Mapped[CandidateStatus] = mapped_column(
        SAEnum(CandidateStatus), default=CandidateStatus.pending
    )
    source: Mapped[str | None] = mapped_column(String(50))
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
