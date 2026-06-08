import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, Boolean, DateTime, Enum as SAEnum, Index, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
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
    failed = "failed"


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        Index(
            "idx_candidates_resume_embedding_hnsw",
            "resume_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"resume_embedding": "vector_cosine_ops"},
        ),
        Index(
            "idx_candidates_profile_embedding_hnsw",
            "profile_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"profile_embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    resume_url: Mapped[str | None] = mapped_column(Text)
    resume_text: Mapped[str | None] = mapped_column(Text)
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())

    # pgvector columns (Layer 1.5 / Layer 2 / Layer 3)
    resume_embedding: Mapped[list | None] = mapped_column(Vector(768))
    profile_embedding: Mapped[list | None] = mapped_column(Vector(768))
    quick_match_score: Mapped[float | None] = mapped_column(Float)
    vector_score: Mapped[float | None] = mapped_column(Float)
    llm_score: Mapped[float | None] = mapped_column(Float)
