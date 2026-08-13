"""Build the day occupancy matrix from bookings + availability blocks."""

from __future__ import annotations

from datetime import date
from uuid import UUID

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.schedule_config import (
    DAY_END_HOUR,
    DAY_START_HOUR,
    RESOURCE_TYPES,
    SLOT_MINUTES,
    SLOTS_PER_DAY,
)
from app.models.availability_block import AvailabilityBlock
from app.models.booking import Booking, BookingSlot, BookingStatus
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.schemas.schedule import (
    OccupantOut,
    ResourceColumnOut,
    ResourceSlotOut,
    ScheduleDayOut,
)
from app.services.scheduling_engine import RESOURCE_INDEX


def get_resources_by_type(db: Session) -> dict[str, Resource]:
    resources = db.scalars(select(Resource)).all()
    by_type: dict[str, Resource] = {}
    for r in resources:
        by_type[r.type.value] = r
    return by_type


def build_used_matrix(
    db: Session,
    day: date,
    *,
    for_update: bool = False,
) -> tuple[np.ndarray, np.ndarray, dict[str, Resource]]:
    """Return (used, capacity, resources_by_type).

    `used[r, t]` counts concurrent occupancy. Admin blocks consume full capacity
    so the engine treats those slots as unavailable.
    """
    resources_by_type = get_resources_by_type(db)
    capacity = np.ones(len(RESOURCE_TYPES), dtype=np.int16)
    used = np.zeros((len(RESOURCE_TYPES), SLOTS_PER_DAY), dtype=np.int16)

    for rtype, resource in resources_by_type.items():
        if rtype in RESOURCE_INDEX:
            capacity[RESOURCE_INDEX[rtype]] = resource.capacity

    booking_q = (
        select(Booking)
        .where(Booking.date == day, Booking.status == BookingStatus.confirmed)
        .options(joinedload(Booking.slots))
    )
    if for_update:
        booking_q = booking_q.with_for_update()
    bookings = db.scalars(booking_q).unique().all()

    for booking in bookings:
        for slot in booking.slots:
            if slot.resource_type.value == "gap" or slot.resource_id is None:
                continue
            rtype = slot.resource_type.value
            if rtype in RESOURCE_INDEX:
                used[RESOURCE_INDEX[rtype], slot.slot_index] += 1

    block_q = select(AvailabilityBlock).where(AvailabilityBlock.date == day)
    if for_update:
        block_q = block_q.with_for_update()
    blocks = db.scalars(block_q).all()

    resource_id_to_type = {r.id: r.type.value for r in resources_by_type.values()}
    for block in blocks:
        rtype = resource_id_to_type.get(block.resource_id)
        if rtype is None or rtype not in RESOURCE_INDEX:
            continue
        ri = RESOURCE_INDEX[rtype]
        # Fully consume capacity for admin-blocked slots
        used[ri, block.slot_index] = max(used[ri, block.slot_index], int(capacity[ri]))

    return used, capacity, resources_by_type


def build_day_matrix(db: Session, day: date, viewer: User) -> ScheduleDayOut:
    resources_by_type = get_resources_by_type(db)
    is_admin = viewer.role == UserRole.admin

    bookings = (
        db.scalars(
            select(Booking)
            .where(Booking.date == day, Booking.status == BookingStatus.confirmed)
            .options(
                joinedload(Booking.slots),
                joinedload(Booking.patient),
                joinedload(Booking.pathway),
            )
        )
        .unique()
        .all()
    )

    blocks = db.scalars(select(AvailabilityBlock).where(AvailabilityBlock.date == day)).all()
    blocked_by_resource: dict[UUID, set[int]] = {}
    for b in blocks:
        blocked_by_resource.setdefault(b.resource_id, set()).add(b.slot_index)

    # occupancy maps: resource_type -> slot_index -> list of occupants
    occupants: dict[str, dict[int, list[OccupantOut]]] = {t: {} for t in RESOURCE_TYPES}
    gap_occupied: dict[int, int] = {}

    for booking in bookings:
        for slot in booking.slots:
            rtype = slot.resource_type.value
            if rtype == "gap":
                gap_occupied[slot.slot_index] = gap_occupied.get(slot.slot_index, 0) + 1
                continue
            info = OccupantOut(
                booking_id=booking.id,
                patient_name=booking.patient.full_name if is_admin else None,
                pathway_name=booking.pathway.name if booking.pathway else None,
            )
            occupants.setdefault(rtype, {}).setdefault(slot.slot_index, []).append(info)

    columns: list[ResourceColumnOut] = []

    # Column order depends on role
    if is_admin:
        column_types = list(RESOURCE_TYPES) + ["patient"]
    else:
        column_types = ["doctor", "nmt", "gap", "scan"]

    for rtype in column_types:
        if rtype == "gap":
            slots = []
            for i in range(SLOTS_PER_DAY):
                occ = gap_occupied.get(i, 0)
                slots.append(
                    ResourceSlotOut(
                        slot_index=i,
                        occupied=occ,
                        capacity=999,
                        blocked=False,
                        free=occ == 0,
                        occupants=[],
                    )
                )
            columns.append(
                ResourceColumnOut(
                    resource_id=None,
                    resource_type="gap",
                    name="Gap",
                    capacity=999,
                    slots=slots,
                )
            )
            continue

        if rtype == "patient":
            # Merged patient activity across the row for admin display
            slots = []
            for i in range(SLOTS_PER_DAY):
                merged: list[OccupantOut] = []
                for rt in RESOURCE_TYPES:
                    merged.extend(occupants.get(rt, {}).get(i, []))
                # de-dupe by booking_id
                seen: set[UUID] = set()
                unique: list[OccupantOut] = []
                for o in merged:
                    if o.booking_id not in seen:
                        seen.add(o.booking_id)
                        unique.append(o)
                slots.append(
                    ResourceSlotOut(
                        slot_index=i,
                        occupied=len(unique),
                        capacity=1,
                        blocked=False,
                        free=len(unique) == 0,
                        occupants=unique if is_admin else [],
                    )
                )
            columns.append(
                ResourceColumnOut(
                    resource_id=None,
                    resource_type="patient",
                    name="Patient",
                    capacity=1,
                    slots=slots,
                )
            )
            continue

        resource = resources_by_type.get(rtype)
        if resource is None:
            continue
        blocked_slots = blocked_by_resource.get(resource.id, set())
        slots = []
        for i in range(SLOTS_PER_DAY):
            occ_list = occupants.get(rtype, {}).get(i, [])
            occupied = len(occ_list)
            is_blocked = i in blocked_slots
            free = (not is_blocked) and occupied < resource.capacity
            slots.append(
                ResourceSlotOut(
                    slot_index=i,
                    occupied=occupied,
                    capacity=resource.capacity,
                    blocked=is_blocked,
                    free=free,
                    occupants=occ_list if is_admin else [],
                )
            )
        columns.append(
            ResourceColumnOut(
                resource_id=resource.id,
                resource_type=rtype,
                name=resource.name,
                capacity=resource.capacity,
                slots=slots,
            )
        )

    return ScheduleDayOut(
        date=day,
        day_start_hour=DAY_START_HOUR,
        day_end_hour=DAY_END_HOUR,
        slot_minutes=SLOT_MINUTES,
        slots_per_day=SLOTS_PER_DAY,
        columns=columns,
    )


def toggle_slots(
    db: Session,
    *,
    day: date,
    resource_type: ResourceType,
    slot_indices: list[int],
    blocked: bool,
    actor_id: UUID,
) -> int:
    resources_by_type = get_resources_by_type(db)
    resource = resources_by_type.get(resource_type.value)
    if resource is None:
        raise ValueError(f"No resource configured for type {resource_type.value}")

    changed = 0
    existing = {
        b.slot_index: b
        for b in db.scalars(
            select(AvailabilityBlock).where(
                AvailabilityBlock.date == day,
                AvailabilityBlock.resource_id == resource.id,
                AvailabilityBlock.slot_index.in_(slot_indices),
            )
        ).all()
    }

    for idx in slot_indices:
        if idx < 0 or idx >= SLOTS_PER_DAY:
            continue
        if blocked:
            if idx not in existing:
                db.add(
                    AvailabilityBlock(
                        resource_id=resource.id,
                        date=day,
                        slot_index=idx,
                        created_by=actor_id,
                        reason="admin_block",
                    )
                )
                changed += 1
        else:
            row = existing.get(idx)
            if row is not None:
                db.delete(row)
                changed += 1

    db.commit()
    return changed
