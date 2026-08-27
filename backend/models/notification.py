import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from backend.database import Base


class HRNotification(Base):
    __tablename__ = "hr_notifications"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Owning HR user — every read/write of a notification must be filtered by this.
    # Nullable so pre-existing rows survive the additive migration; those legacy rows
    # are simply never returned to anyone.
    hr_user_id   = Column(UUID(as_uuid=True), nullable=True, index=True)
    type         = Column(String(50), nullable=False)      # e.g. "call_interrupted"
    title        = Column(String(200), nullable=False)
    message      = Column(Text, nullable=False)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True)
    read         = Column(Boolean, default=False, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
