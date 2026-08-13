from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.booking import BookingStatus
from app.models.pathway import StepResourceType


class BookingSearchRequest(BaseModel):
    pathway_id: UUID
    date: date


class RejectedAttemptOut(BaseModel):
    slot_index: int
    blocking_resource: str
    offset: int = 0


class BookingSlotOut(BaseModel):
    slot_index: int
    resource_type: StepResourceType
    resource_id: UUID | None = None


class BookingSearchResponse(BaseModel):
    pathway_id: UUID
    date: date
    earliest_start_slot: int | None
    end_slot: int | None
    feasible_starts: list[int] = []
    rejected_attempts: list[RejectedAttemptOut]
    slots: list[BookingSlotOut]
    total_blocks: int


class BookingCreateRequest(BaseModel):
    pathway_id: UUID
    date: date
    start_slot: int = Field(ge=0)


class BookingOut(BaseModel):
    id: UUID
    patient_id: UUID
    pathway_id: UUID
    pathway_name: str | None = None
    date: date
    start_slot: int
    end_slot: int | None = None
    status: BookingStatus
    created_at: datetime | None = None
    slots: list[BookingSlotOut] = []

    model_config = {"from_attributes": True}


class BookingConflictOut(BaseModel):
    detail: str
    suggestion: BookingSearchResponse | None = None
