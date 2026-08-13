from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class StepResourceType(str, enum.Enum):
    doctor = "doctor"
    nmt = "nmt"
    gap = "gap"
    scan = "scan"


class Pathway(Base):
    __tablename__ = "pathways"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    steps = relationship(
        "PathwayStep",
        back_populates="pathway",
        cascade="all, delete-orphan",
        order_by="PathwayStep.sequence_order",
    )


class PathwayStep(Base):
    __tablename__ = "pathway_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pathway_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pathways.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[StepResourceType] = mapped_column(
        Enum(StepResourceType, name="step_resource_type"), nullable=False
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    block_count: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)

    pathway = relationship("Pathway", back_populates="steps")
