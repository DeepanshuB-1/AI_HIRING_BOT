import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, Enum as SAEnum, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from backend.database import Base
import enum


class AIRecommendation(str, enum.Enum):
    HIRE = "HIRE"
    SHORTLIST = "SHORTLIST"
    HOLD = "HOLD"
    REJECT = "REJECT"


class ScoreReport(Base):
    __tablename__ = "score_reports"
    __table_args__ = (
        Index(
            "idx_score_reports_report_embedding_hnsw",
            "report_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"report_embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, default=0)
    skills_score: Mapped[int] = mapped_column(Integer, default=0)
    experience_score: Mapped[int] = mapped_column(Integer, default=0)
    communication_score: Mapped[int] = mapped_column(Integer, default=0)
    culture_fit_score: Mapped[int] = mapped_column(Integer, default=0)
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    ai_recommendation: Mapped[AIRecommendation] = mapped_column(
        SAEnum(AIRecommendation), default=AIRecommendation.HOLD
    )
    ai_reasoning: Mapped[str | None] = mapped_column(Text)
    red_flags: Mapped[list | None] = mapped_column(JSONB)
    strengths: Mapped[list | None] = mapped_column(JSONB)
    next_round_questions: Mapped[list | None] = mapped_column(JSONB)
    report_model: Mapped[str] = mapped_column(String(50), default="llama3.1:8b")
    hr_override: Mapped[AIRecommendation | None] = mapped_column(SAEnum(AIRecommendation))
    hr_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # pgvector column (Layer 6)
    report_embedding: Mapped[list | None] = mapped_column(Vector(768))
