"""Seed demo users, resources, pathways, and today's schedule occupancy.

Run from backend/:  python -m scripts.seed
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

# Allow `python scripts/seed.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.core.schedule_config import PATHWAY_1_STEPS
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.availability_block import AvailabilityBlock
from app.models.booking import Booking, BookingSlot, BookingStatus
from app.models.pathway import Pathway, PathwayStep, StepResourceType
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.services.scheduling_engine import build_requirement_array, expand_booking_slots

ADMIN_EMAIL = "admin@utscheduler.com"
PATIENT_EMAIL = "patient@utscheduler.com"
DEMO_PASSWORD = "Theranostics2026!"


def _clear(db) -> None:
    db.execute(delete(BookingSlot))
    db.execute(delete(Booking))
    db.execute(delete(AvailabilityBlock))
    db.execute(delete(PathwayStep))
    db.execute(delete(Pathway))
    db.execute(delete(Resource))
    db.execute(delete(User))
    db.commit()


def _add_pathway(db, name: str, steps: list[dict], created_by) -> Pathway:
    pathway = Pathway(name=name, created_by=created_by)
    for step in steps:
        pathway.steps.append(
            PathwayStep(
                resource_type=StepResourceType(step["resource_type"]),
                duration_minutes=step["duration_minutes"],
                block_count=step["block_count"],
                sequence_order=step["sequence_order"],
            )
        )
    db.add(pathway)
    db.flush()
    return pathway


def _book(
    db,
    *,
    patient: User,
    pathway: Pathway,
    day: date,
    start_slot: int,
    resources_by_type: dict[str, Resource],
) -> Booking:
    requirement = build_requirement_array(pathway.steps)
    booking = Booking(
        patient_id=patient.id,
        pathway_id=pathway.id,
        date=day,
        start_slot=start_slot,
        status=BookingStatus.confirmed,
    )
    for slot_index, rtype in expand_booking_slots(requirement, start_slot):
        if rtype is None:
            booking.slots.append(
                BookingSlot(resource_id=None, resource_type=StepResourceType.gap, slot_index=slot_index)
            )
        else:
            res = resources_by_type[rtype]
            booking.slots.append(
                BookingSlot(
                    resource_id=res.id,
                    resource_type=StepResourceType(rtype),
                    slot_index=slot_index,
                )
            )
    db.add(booking)
    return booking


def seed() -> None:
    db = SessionLocal()
    try:
        _clear(db)

        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.admin,
            full_name="Alex Rivera",
        )
        patient = User(
            email=PATIENT_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.patient,
            full_name="Jordan Lee",
        )
        # Extra patient for afternoon demo bookings
        other = User(
            email="k.whitfield@utcare.org",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.patient,
            full_name="K. Whitfield",
        )
        db.add_all([admin, patient, other])
        db.flush()

        doctor = Resource(type=ResourceType.doctor, name="Doctor", capacity=1)
        nmt = Resource(type=ResourceType.nmt, name="NMT", capacity=1)
        scan = Resource(type=ResourceType.scan, name="Scan", capacity=1)
        db.add_all([doctor, nmt, scan])
        db.flush()
        resources_by_type = {"doctor": doctor, "nmt": nmt, "scan": scan}

        # Pathway 1 — brief ground truth (9 blocks / 4h 30m)
        p1 = _add_pathway(db, "Pathway 1 · Lu-177 standard", PATHWAY_1_STEPS, admin.id)

        # Pathway 2 — extended uptake
        p2 = _add_pathway(
            db,
            "Pathway 2 · Extended uptake",
            [
                {"resource_type": "doctor", "duration_minutes": 60, "block_count": 2, "sequence_order": 0},
                {"resource_type": "nmt", "duration_minutes": 30, "block_count": 1, "sequence_order": 1},
                {"resource_type": "gap", "duration_minutes": 120, "block_count": 4, "sequence_order": 2},
                {"resource_type": "scan", "duration_minutes": 60, "block_count": 2, "sequence_order": 3},
                {"resource_type": "doctor", "duration_minutes": 30, "block_count": 1, "sequence_order": 4},
            ],
            admin.id,
        )

        # Pathway 3 — same-day imaging (shorter)
        p3 = _add_pathway(
            db,
            "Pathway 3 · Same-day imaging",
            [
                {"resource_type": "doctor", "duration_minutes": 30, "block_count": 1, "sequence_order": 0},
                {"resource_type": "nmt", "duration_minutes": 30, "block_count": 1, "sequence_order": 1},
                {"resource_type": "gap", "duration_minutes": 30, "block_count": 1, "sequence_order": 2},
                {"resource_type": "scan", "duration_minutes": 60, "block_count": 2, "sequence_order": 3},
                {"resource_type": "doctor", "duration_minutes": 30, "block_count": 1, "sequence_order": 4},
            ],
            admin.id,
        )
        _ = (p2, p3)

        # Always relative to the calendar day this script runs — never hardcode a date.
        today = date.today()

        # Early-morning doctor consult (08:00–09:00) via a short same-day pathway start
        _book(db, patient=other, pathway=p3, day=today, start_slot=0, resources_by_type=resources_by_type)

        # NMT dose-prep feel: block NMT mid-morning if not covered — slots 2-3 (09:00-10:00)
        # Actually the p3 booking already uses NMT at slot 1. Add admin blocks for a
        # mid-morning cluster on doctor (slots 6-9 → 11:00-13:00) to force search animation.
        for idx in (6, 7, 8, 9):
            db.add(
                AvailabilityBlock(
                    resource_id=doctor.id,
                    date=today,
                    slot_index=idx,
                    created_by=admin.id,
                    reason="admin_block",
                )
            )

        # Afternoon booking starting 14:00 (slot 12) with pathway 3 for other patient
        # — may conflict; use tomorrow's patient slot instead for afternoon density:
        afternoon_patient = User(
            email="demo.afternoon@utscheduler.com",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.patient,
            full_name="Sam Ortiz",
        )
        db.add(afternoon_patient)
        db.flush()
        _book(
            db,
            patient=afternoon_patient,
            pathway=p3,
            day=today,
            start_slot=14,  # 15:00
            resources_by_type=resources_by_type,
        )

        # Light NMT block late morning
        for idx in (4, 5):
            db.add(
                AvailabilityBlock(
                    resource_id=nmt.id,
                    date=today,
                    slot_index=idx,
                    created_by=admin.id,
                    reason="dose_prep",
                )
            )

        db.commit()

        # Verify pathway 1 search finds a fit
        from app.services.booking_service import search_booking

        result = search_booking(db, p1.id, today)

        print("=" * 60)
        print("UT Scheduler seed complete")
        print("=" * 60)
        print(f"Admin:   {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print(f"Patient: {PATIENT_EMAIL} / {DEMO_PASSWORD}")
        print(f"Today:   {today.isoformat()}")
        print(f"Pathway 1 earliest start slot: {result.earliest_start_slot} "
              f"(end {result.end_slot}), rejected={len(result.rejected_attempts)}")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
