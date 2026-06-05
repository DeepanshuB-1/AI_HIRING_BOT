import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, Enum as SAEnum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from backend.database import Base


class QuestionType(str, enum.Enum):
    warmup = "warmup"
    technical = "technical"
    behavioral = "behavioral"
    resume_probe = "resume_probe"
    situational = "situational"
    closing = "closing"


class DifficultyLevel(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class QuestionBank(Base):
    __tablename__ = "question_bank"
    __table_args__ = (
        Index(
            "idx_question_bank_embedding_hnsw",
            "question_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"question_embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jd_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_embedding: Mapped[list | None] = mapped_column(Vector(768))
    question_type: Mapped[QuestionType] = mapped_column(
        SAEnum(QuestionType, name="questiontype"), default=QuestionType.technical
    )
    difficulty: Mapped[DifficultyLevel] = mapped_column(
        SAEnum(DifficultyLevel, name="difficultylevel"), default=DifficultyLevel.medium
    )
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
