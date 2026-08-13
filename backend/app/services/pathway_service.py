"""Pathway CRUD and validation."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.schedule_config import SLOT_MINUTES
from app.models.pathway import Pathway, PathwayStep, StepResourceType
from app.schemas.pathway import PathwayCreate, PathwayOut, PathwayStepOut, PathwayUpdate


def _validate_steps(steps: list) -> None:
    if not steps:
        raise ValueError("Pathway must have at least one step")
    for step in steps:
        expected = step.duration_minutes // SLOT_MINUTES
        if step.duration_minutes % SLOT_MINUTES != 0:
            raise ValueError(
                f"duration_minutes {step.duration_minutes} must be a multiple of {SLOT_MINUTES}"
            )
        if step.block_count != expected:
            raise ValueError(
                f"block_count {step.block_count} must equal duration_minutes/{SLOT_MINUTES} "
                f"({expected}) for type {step.resource_type}"
            )


def _to_out(pathway: Pathway) -> PathwayOut:
    steps = [
        PathwayStepOut(
            id=s.id,
            resource_type=s.resource_type,
            duration_minutes=s.duration_minutes,
            block_count=s.block_count,
            sequence_order=s.sequence_order,
        )
        for s in sorted(pathway.steps, key=lambda x: x.sequence_order)
    ]
    total_blocks = sum(s.block_count for s in steps)
    total_minutes = sum(s.duration_minutes for s in steps)
    return PathwayOut(
        id=pathway.id,
        name=pathway.name,
        created_by=pathway.created_by,
        created_at=pathway.created_at,
        steps=steps,
        total_blocks=total_blocks,
        total_minutes=total_minutes,
    )


def list_pathways(db: Session) -> list[PathwayOut]:
    rows = db.scalars(select(Pathway).options(joinedload(Pathway.steps)).order_by(Pathway.created_at)).unique().all()
    return [_to_out(p) for p in rows]


def get_pathway(db: Session, pathway_id: UUID) -> Pathway | None:
    return db.scalar(
        select(Pathway).where(Pathway.id == pathway_id).options(joinedload(Pathway.steps))
    )


def create_pathway(db: Session, data: PathwayCreate, actor_id: UUID | None) -> PathwayOut:
    _validate_steps(data.steps)
    pathway = Pathway(name=data.name, created_by=actor_id)
    for step in data.steps:
        pathway.steps.append(
            PathwayStep(
                resource_type=StepResourceType(step.resource_type),
                duration_minutes=step.duration_minutes,
                block_count=step.block_count,
                sequence_order=step.sequence_order,
            )
        )
    db.add(pathway)
    db.commit()
    db.refresh(pathway)
    pathway = get_pathway(db, pathway.id)
    assert pathway is not None
    return _to_out(pathway)


def update_pathway(db: Session, pathway_id: UUID, data: PathwayUpdate) -> PathwayOut:
    pathway = get_pathway(db, pathway_id)
    if pathway is None:
        raise LookupError("Pathway not found")
    if data.name is not None:
        pathway.name = data.name
    if data.steps is not None:
        _validate_steps(data.steps)
        pathway.steps.clear()
        db.flush()
        for step in data.steps:
            pathway.steps.append(
                PathwayStep(
                    resource_type=StepResourceType(step.resource_type),
                    duration_minutes=step.duration_minutes,
                    block_count=step.block_count,
                    sequence_order=step.sequence_order,
                )
            )
    db.commit()
    pathway = get_pathway(db, pathway_id)
    assert pathway is not None
    return _to_out(pathway)


def delete_pathway(db: Session, pathway_id: UUID) -> None:
    pathway = get_pathway(db, pathway_id)
    if pathway is None:
        raise LookupError("Pathway not found")
    db.delete(pathway)
    db.commit()
