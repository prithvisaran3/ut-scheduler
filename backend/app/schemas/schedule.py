from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.resource import ResourceType


class SlotPatchRequest(BaseModel):
    date: date
    resource_type: ResourceType
    slot_indices: list[int] = Field(min_length=1)
    blocked: bool


class OccupantOut(BaseModel):
    booking_id: UUID
    patient_name: str | None = None
    pathway_name: str | None = None


class ResourceSlotOut(BaseModel):
    slot_index: int
    occupied: int
    capacity: int
    blocked: bool = False
    free: bool
    occupants: list[OccupantOut] = []
    # True on Patient-column cells that are uptake/gap time (resources free).
    is_uptake: bool = False


class ResourceColumnOut(BaseModel):
    resource_id: UUID | None
    resource_type: str
    name: str | None = None
    capacity: int
    slots: list[ResourceSlotOut]


class ScheduleDayOut(BaseModel):
    date: date
    day_start_hour: int
    day_end_hour: int
    slot_minutes: int
    slots_per_day: int
    columns: list[ResourceColumnOut]
