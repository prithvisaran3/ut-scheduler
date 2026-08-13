from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.pathway import StepResourceType


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    pathway_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pathways.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_slot: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status"), nullable=False, default=BookingStatus.confirmed
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("User", back_populates="bookings", foreign_keys=[patient_id])
    pathway = relationship("Pathway")
    slots = relationship("BookingSlot", back_populates="booking", cascade="all, delete-orphan")


class BookingSlot(Base):
    """One occupied slot in a booking. resource_id is null only for gap slots."""

    __tablename__ = "booking_slots"
    __table_args__ = (
        CheckConstraint(
            "(resource_type = 'gap' AND resource_id IS NULL) OR "
            "(resource_type <> 'gap' AND resource_id IS NOT NULL)",
            name="ck_booking_slots_resource_id_for_nongap",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id"), nullable=True
    )
    resource_type: Mapped[StepResourceType] = mapped_column(
        Enum(StepResourceType, name="step_resource_type", create_type=False), nullable=False
    )
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)

    booking = relationship("Booking", back_populates="slots")
