from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.schedule_config import DEFAULT_CAPACITY
from app.db.base import Base


class ResourceType(str, enum.Enum):
    doctor = "doctor"
    nmt = "nmt"
    scan = "scan"
    nurse = "nurse"


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (UniqueConstraint("type", name="uq_resources_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[ResourceType] = mapped_column(Enum(ResourceType, name="resource_type"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_CAPACITY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
