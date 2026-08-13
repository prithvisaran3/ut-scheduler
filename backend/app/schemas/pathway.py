from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.pathway import StepResourceType


class PathwayStepIn(BaseModel):
    resource_type: StepResourceType
    duration_minutes: int = Field(gt=0)
    block_count: int = Field(gt=0)
    sequence_order: int = Field(ge=0)


class PathwayStepOut(PathwayStepIn):
    id: UUID

    model_config = {"from_attributes": True}


class PathwayCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    steps: list[PathwayStepIn]


class PathwayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    steps: list[PathwayStepIn] | None = None


class PathwayOut(BaseModel):
    id: UUID
    name: str
    created_by: UUID | None
    created_at: datetime | None
    steps: list[PathwayStepOut]
    total_blocks: int
    total_minutes: int

    model_config = {"from_attributes": True}
