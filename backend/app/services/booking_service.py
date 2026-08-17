"""Booking orchestration: search + transactional confirm with row locks."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import clinic_now, slot_start
from app.models.availability_block import AvailabilityBlock
from app.models.booking import Booking, BookingSlot, BookingStatus
from app.models.pathway import Pathway, StepResourceType
from app.models.user import User
from app.schemas.booking import (
    BookingCreateRequest,
    BookingOut,
    BookingSearchResponse,
    BookingSlotOut,
    RejectedAttemptOut,
)
from app.services.pathway_service import get_pathway
from app.services.schedule_service import build_used_matrix, get_resources_by_type
from app.services.scheduling_engine import (
    FitResult,
    build_requirement_array,
    expand_booking_slots,
    find_earliest_fit,
)


def _is_weekend(day: date) -> bool:
    return day.weekday() >= 5  # Saturday / Sunday


def _has_started(day: date, slot_index: int, now: datetime) -> bool:
    """True once the slot's own start time has passed at the clinic.

    A slot stays bookable right up to the instant it begins, so 12:00:00 sharp
    still books the 12:00 slot. Comparing real start times (rather than a
    floor-divided index) also makes past and future dates fall out for free.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware — use app.core.clock.clinic_now()")
    return slot_start(day, slot_index) < now


def _apply_temporal_filters(
    day: date,
    fit: FitResult,
    *,
    now: datetime | None = None,
) -> FitResult:
    """Drop weekend / past starts. Empty result (not error) when nothing remains."""
    if _is_weekend(day):
        return FitResult(
            earliest_start_slot=None,
            end_slot=None,
            rejected_attempts=[],
            requirement_length=fit.requirement_length,
            feasible_starts=[],
        )

    moment = now if now is not None else clinic_now()
    feasible = [s for s in fit.feasible_starts if not _has_started(day, s, moment)]
    if not feasible:
        return FitResult(
            earliest_start_slot=None,
            end_slot=None,
            rejected_attempts=fit.rejected_attempts,
            requirement_length=fit.requirement_length,
            feasible_starts=[],
        )
    earliest = feasible[0]
    return FitResult(
        earliest_start_slot=earliest,
        end_slot=earliest + fit.requirement_length,
        rejected_attempts=fit.rejected_attempts,
        requirement_length=fit.requirement_length,
        feasible_starts=feasible,
    )


class BookingConflictError(Exception):
    def __init__(self, message: str, suggestion: BookingSearchResponse | None = None):
        super().__init__(message)
        self.suggestion = suggestion


def _search_response(
    pathway: Pathway,
    day: date,
    fit,
    requirement,
    resources_by_type: dict,
) -> BookingSearchResponse:
    slots: list[BookingSlotOut] = []
    if fit.earliest_start_slot is not None:
        for slot_index, rtype in expand_booking_slots(requirement, fit.earliest_start_slot):
            resource_id = None
            step_type = StepResourceType.gap
            if rtype is None:
                step_type = StepResourceType.gap
            else:
                step_type = StepResourceType(rtype)
                res = resources_by_type.get(rtype)
                resource_id = res.id if res else None
            slots.append(
                BookingSlotOut(slot_index=slot_index, resource_type=step_type, resource_id=resource_id)
            )

    return BookingSearchResponse(
        pathway_id=pathway.id,
        date=day,
        earliest_start_slot=fit.earliest_start_slot,
        end_slot=fit.end_slot,
        feasible_starts=list(fit.feasible_starts),
        rejected_attempts=[
            RejectedAttemptOut(
                slot_index=a.slot_index,
                blocking_resource=a.blocking_resource,
                offset=a.offset,
            )
            for a in fit.rejected_attempts
        ],
        slots=slots,
        total_blocks=int(requirement.shape[0]),
    )


def search_booking(
    db: Session,
    pathway_id: UUID,
    day: date,
    *,
    now: datetime | None = None,
) -> BookingSearchResponse:
    pathway = get_pathway(db, pathway_id)
    if pathway is None:
        raise LookupError("Pathway not found")

    used, capacity, resources_by_type = build_used_matrix(db, day)
    requirement = build_requirement_array(pathway.steps)
    fit = _apply_temporal_filters(
        day, find_earliest_fit(used, capacity, requirement), now=now
    )
    return _search_response(pathway, day, fit, requirement, resources_by_type)


def _fits_at(
    used,
    capacity,
    requirement,
    start_slot: int,
) -> bool:
    length = int(requirement.shape[0])
    if start_slot < 0 or start_slot + length > used.shape[1]:
        return False
    from app.services.scheduling_engine import GAP_SENTINEL

    for offset, req in enumerate(requirement):
        if req == GAP_SENTINEL:
            continue
        r = int(req)
        if used[r, start_slot + offset] + 1 > capacity[r]:
            return False
    return True


def confirm_booking(
    db: Session,
    patient: User,
    data: BookingCreateRequest,
    *,
    now: datetime | None = None,
) -> BookingOut:
    from app.models.resource import Resource

    pathway = get_pathway(db, data.pathway_id)
    if pathway is None:
        raise LookupError("Pathway not found")

    if _is_weekend(data.date):
        raise ValueError("Clinic is closed on weekends — please choose a weekday.")

    moment = now if now is not None else clinic_now()
    if _has_started(data.date, data.start_slot, moment):
        raise ValueError("That start time is already in the past. Choose a later slot.")

    # Serialize concurrent confirms by locking capacity resources first.
    # (Locking only bookings/blocks is a no-op on an empty day.)
    db.scalars(select(Resource).order_by(Resource.type).with_for_update()).all()
    db.scalars(
        select(AvailabilityBlock)
        .where(AvailabilityBlock.date == data.date)
        .with_for_update()
    ).all()
    db.scalars(
        select(Booking)
        .where(Booking.date == data.date, Booking.status == BookingStatus.confirmed)
        .with_for_update()
    ).all()

    used, capacity, resources_by_type = build_used_matrix(db, data.date, for_update=False)
    requirement = build_requirement_array(pathway.steps)

    if not _fits_at(used, capacity, requirement, data.start_slot):
        fit = _apply_temporal_filters(
            data.date, find_earliest_fit(used, capacity, requirement), now=moment
        )
        suggestion = _search_response(pathway, data.date, fit, requirement, resources_by_type)
        raise BookingConflictError(
            "Selected start slot is no longer available",
            suggestion=suggestion,
        )

    booking = Booking(
        patient_id=patient.id,
        pathway_id=pathway.id,
        date=data.date,
        start_slot=data.start_slot,
        status=BookingStatus.confirmed,
    )
    for slot_index, rtype in expand_booking_slots(requirement, data.start_slot):
        if rtype is None:
            booking.slots.append(
                BookingSlot(
                    resource_id=None,
                    resource_type=StepResourceType.gap,
                    slot_index=slot_index,
                )
            )
        else:
            res = resources_by_type.get(rtype)
            if res is None:
                db.rollback()
                raise ValueError(
                    f"No resource configured for type {rtype}; refusing to create booking "
                    "with a null resource_id"
                )
            booking.slots.append(
                BookingSlot(
                    resource_id=res.id,
                    resource_type=StepResourceType(rtype),
                    slot_index=slot_index,
                )
            )

    db.add(booking)
    db.commit()
    db.refresh(booking)
    return get_booking_out(db, booking.id)


def get_booking_out(db: Session, booking_id: UUID) -> BookingOut:
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(joinedload(Booking.slots), joinedload(Booking.pathway))
    )
    if booking is None:
        raise LookupError("Booking not found")
    slots = [
        BookingSlotOut(
            slot_index=s.slot_index,
            resource_type=s.resource_type,
            resource_id=s.resource_id,
        )
        for s in sorted(booking.slots, key=lambda x: x.slot_index)
    ]
    end_slot = (max((s.slot_index for s in slots), default=booking.start_slot) + 1) if slots else None
    return BookingOut(
        id=booking.id,
        patient_id=booking.patient_id,
        pathway_id=booking.pathway_id,
        pathway_name=booking.pathway.name if booking.pathway else None,
        date=booking.date,
        start_slot=booking.start_slot,
        end_slot=end_slot,
        status=booking.status,
        created_at=booking.created_at,
        slots=slots,
    )


def list_my_bookings(db: Session, patient_id: UUID) -> list[BookingOut]:
    rows = db.scalars(
        select(Booking)
        .where(Booking.patient_id == patient_id, Booking.status == BookingStatus.confirmed)
        .options(joinedload(Booking.slots), joinedload(Booking.pathway))
        .order_by(Booking.date, Booking.start_slot)
    ).unique().all()
    return [get_booking_out(db, b.id) for b in rows]


def cancel_booking(db: Session, booking_id: UUID, actor: User) -> None:
    booking = db.scalar(select(Booking).where(Booking.id == booking_id))
    if booking is None:
        raise LookupError("Booking not found")
    if actor.role.value != "admin" and booking.patient_id != actor.id:
        raise PermissionError("Cannot cancel another patient's booking")
    booking.status = BookingStatus.cancelled
    db.commit()


def conflict_http(exc: BookingConflictError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": str(exc),
            "suggestion": exc.suggestion.model_dump(mode="json") if exc.suggestion else None,
        },
    )
