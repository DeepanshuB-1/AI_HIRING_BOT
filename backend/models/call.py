import uuid
from datetime import datetime, date, time
from sqlalchemy import String, Integer, Text, Date, Time, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base
import enum


class CallStatus(str, enum.Enum):
    pending = "pending"
    dialing = "dialing"
    in_progress = "in_progress"
    completed = "completed"
    no_answer = "no_answer"
    failed = "failed"


class ScreeningCall(Base):
    __tablename__ = "screening_calls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    twilio_call_sid: Mapped[str | None] = mapped_column(String(100))
    scheduled_date: Mapped[date | None] = mapped_column(Date)
    scheduled_time: Mapped[time | None] = mapped_column(Time)
    call_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    call_ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    recording_url: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[list | None] = mapped_column(JSONB)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    interview_model: Mapped[str] = mapped_column(String(50), default="mistral:7b")
    status: Mapped[CallStatus] = mapped_column(SAEnum(CallStatus), default=CallStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
