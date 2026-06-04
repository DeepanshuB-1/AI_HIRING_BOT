import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str | None] = mapped_column(String(100))
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    required_skills: Mapped[list | None] = mapped_column(JSONB)
    min_experience: Mapped[int] = mapped_column(Integer, default=0)
    auto_reject_threshold: Mapped[int] = mapped_column(Integer, default=40)
    question_count: Mapped[int] = mapped_column(Integer, default=10)
    pinned_questions: Mapped[list | None] = mapped_column(JSONB)
    ollama_model_override: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
