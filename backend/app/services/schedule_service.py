"""Build the day occupancy matrix from bookings + availability blocks."""

from __future__ import annotations

from datetime import date
from uuid import UUID

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.schedule_config import (
    ADMIN_DISPLAY_COLUMNS,
    DAY_END_HOUR,
    DAY_START_HOUR,
    PATIENT_DISPLAY_COLUMNS,
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
    """Return one Resource per type (oldest wins if duplicates exist)."""
    resources = db.scalars(
        select(Resource).order_by(Resource.created_at.asc(), Resource.id.asc())
    ).all()
    by_type: dict[str, Resource] = {}
    for r in resources:
        if r.type.value not in by_type:
            by_type[r.type.value] = r
    return by_type


def find_duplicate_resources(db: Session) -> dict[str, list[Resource]]:
    """Resources sharing a type — keyed by type value, oldest first."""
    resources = db.scalars(
        select(Resource).order_by(Resource.created_at.asc(), Resource.id.asc())
    ).all()
    grouped: dict[str, list[Resource]] = {}
    for r in resources:
        grouped.setdefault(r.type.value, []).append(r)
    return {k: v for k, v in grouped.items() if len(v) > 1}


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
            rtype = slot.resource_type.value
            # Occupancy is by resource_type (same as the grid). Never skip
            # non-gap slots just because resource_id is NULL — that caused
            # engine/grid disagreement and colliding offers.
            if rtype == "gap":
                continue
            if rtype in RESOURCE_INDEX:
                used[RESOURCE_INDEX[rtype], slot.slot_index] += 1

    block_q = select(AvailabilityBlock).where(AvailabilityBlock.date == day)
    if for_update:
        block_q = block_q.with_for_update()
    blocks = db.scalars(block_q).all()

    # Map every resource row (including duplicates) so admin blocks never vanish.
    all_resources = db.scalars(select(Resource)).all()
    resource_id_to_type = {r.id: r.type.value for r in all_resources}
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

    # Union of blocks across every resource row of a given type (duplicate-safe).
    blocked_by_type: dict[str, set[int]] = {}
    for res in db.scalars(select(Resource)).all():
        blocked_by_type.setdefault(res.type.value, set()).update(
            blocked_by_resource.get(res.id, set())
        )

    # occupancy maps: resource_type -> slot_index -> list of occupants (admin only)
    # Patients get counts only — never booking_id / patient_name / pathway_name.
    occupants: dict[str, dict[int, list[OccupantOut]]] = {t: {} for t in RESOURCE_TYPES}
    occupied_counts: dict[str, dict[int, int]] = {t: {} for t in RESOURCE_TYPES}
    # Admin Patient column: continuous across every booking (incl. gaps).
    patient_occupants: dict[int, list[OccupantOut]] = {}
    # Patient GAP column: only this viewer's own gap slots (privacy + noise).
    own_gap_slots: dict[int, int] = {}
    uptake_slots: set[int] = set()

    for booking in bookings:
        own_booking = booking.patient_id == viewer.id
        admin_info = (
            OccupantOut(
                booking_id=booking.id,
                patient_name=booking.patient.full_name,
                pathway_name=booking.pathway.name if booking.pathway else None,
            )
            if is_admin
            else None
        )
        for slot in booking.slots:
            rtype = slot.resource_type.value

            if is_admin and admin_info is not None:
                # Continuous Patient column for admin (all steps including gap).
                patient_occupants.setdefault(slot.slot_index, []).append(admin_info)

            if rtype == "gap":
                if is_admin:
                    uptake_slots.add(slot.slot_index)
                elif own_booking:
                    own_gap_slots[slot.slot_index] = own_gap_slots.get(slot.slot_index, 0) + 1
                continue

            occupied_counts.setdefault(rtype, {})
            occupied_counts[rtype][slot.slot_index] = (
                occupied_counts[rtype].get(slot.slot_index, 0) + 1
            )
            if is_admin and admin_info is not None:
                occupants.setdefault(rtype, {}).setdefault(slot.slot_index, []).append(
                    admin_info
                )

    columns: list[ResourceColumnOut] = []
    column_types = ADMIN_DISPLAY_COLUMNS if is_admin else PATIENT_DISPLAY_COLUMNS

    for rtype in column_types:
        if rtype == "patient":
            slots = []
            for i in range(SLOTS_PER_DAY):
                merged = patient_occupants.get(i, [])
                seen: set[UUID] = set()
                unique: list[OccupantOut] = []
                for o in merged:
                    if o.booking_id not in seen:
                        seen.add(o.booking_id)
                        unique.append(o)
                occupied = len(unique)
                slots.append(
                    ResourceSlotOut(
                        slot_index=i,
                        occupied=occupied,
                        capacity=1,
                        blocked=False,
                        free=occupied == 0,
                        occupants=unique,
                        is_uptake=occupied > 0 and i in uptake_slots,
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

        if rtype == "gap":
            # Patient view only — own gaps / prospective uptake, never others'.
            slots = []
            for i in range(SLOTS_PER_DAY):
                occ = own_gap_slots.get(i, 0)
                slots.append(
                    ResourceSlotOut(
                        slot_index=i,
                        occupied=occ,
                        capacity=999,
                        blocked=False,
                        free=occ == 0,
                        occupants=[],
                        is_uptake=occ > 0,
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

        resource = resources_by_type.get(rtype)
        if resource is None:
            continue
        blocked_slots = blocked_by_type.get(rtype, set())
        slots = []
        for i in range(SLOTS_PER_DAY):
            occ_list = occupants.get(rtype, {}).get(i, []) if is_admin else []
            occupied = (
                len(occ_list)
                if is_admin
                else occupied_counts.get(rtype, {}).get(i, 0)
            )
            is_blocked = i in blocked_slots
            free = (not is_blocked) and occupied < resource.capacity
            slots.append(
                ResourceSlotOut(
                    slot_index=i,
                    occupied=occupied,
                    capacity=resource.capacity,
                    blocked=is_blocked,
                    free=free,
                    occupants=occ_list,
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

    # Prevent admin blocks on slots that already have a confirmed booking —
    # blocking on top of occupancy confuses the grid without freeing capacity.
    if blocked:
        used, _cap, _ = build_used_matrix(db, day)
        ri = RESOURCE_INDEX.get(resource_type.value)
        if ri is not None:
            conflicted = [
                idx
                for idx in slot_indices
                if 0 <= idx < SLOTS_PER_DAY and int(used[ri, idx]) > 0
            ]
            if conflicted:
                raise ValueError(
                    "Cannot block slots that already have a booking. "
                    f"Occupied slot indices: {conflicted}"
                )

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
