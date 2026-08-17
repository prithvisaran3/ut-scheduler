"""Regression: search must never offer starts that collide with an existing booking.

Also covers the historical bug where BookingSlot.resource_id IS NULL made the
engine ignore occupancy that the grid still rendered as booked.

Requires TEST_DATABASE_URL.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

import numpy as np
import pytest
from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import sessionmaker

from app.core.schedule_config import SLOTS_PER_DAY
from app.core.security import hash_password
from app.db.url import with_sslmode_require
from app.models.booking import Booking, BookingSlot
from app.models.pathway import Pathway, PathwayStep, StepResourceType
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.schemas.booking import BookingCreateRequest
from app.services.booking_service import confirm_booking, search_booking
from app.services.scheduling_engine import (
    RESOURCE_INDEX,
    RESOURCE_TYPES,
    build_requirement_array,
    expand_booking_slots,
)
from app.services.schedule_service import build_used_matrix


def _test_database_url() -> str | None:
    return os.environ.get("TEST_DATABASE_URL") or None


@pytest.fixture(scope="module")
def test_engine():
    url = _test_database_url()
    if not url:
        pytest.skip("TEST_DATABASE_URL is unset — refusing to run against production DATABASE_URL")
    engine = create_engine(with_sslmode_require(url), pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"TEST_DATABASE_URL not reachable: {exc}")
    yield engine
    engine.dispose()


def _ensure_resources(db, created_resource_ids: list) -> None:
    for rtype, name in [
        (ResourceType.doctor, "Doctor"),
        (ResourceType.nmt, "NMT"),
        (ResourceType.scan, "Scan"),
        (ResourceType.nurse, "Nurse"),
    ]:
        existing = db.scalar(select(Resource).where(Resource.type == rtype))
        if existing is None:
            res = Resource(type=rtype, name=name, capacity=1)
            db.add(res)
            db.flush()
            created_resource_ids.append(res.id)


def test_search_never_overlaps_confirmed_booking(test_engine) -> None:
    SessionLocal = sessionmaker(bind=test_engine)
    day = date.today() + timedelta(days=300 + (uuid4().int % 50))
    suffix = uuid4().hex[:8]

    admin_id = patient_id = pathway_id = None
    created_resource_ids: list = []

    try:
        with SessionLocal() as db:
            admin = User(
                email=f"admin-ov-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.admin,
                full_name="Admin OV",
            )
            patient = User(
                email=f"pat-ov-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.patient,
                full_name="Patient OV",
            )
            db.add_all([admin, patient])
            db.flush()
            _ensure_resources(db, created_resource_ids)

            pathway = Pathway(name=f"Overlap-{suffix}", created_by=admin.id)
            for order, (rtype, blocks) in enumerate(
                [
                    (StepResourceType.doctor, 2),
                    (StepResourceType.nmt, 1),
                    (StepResourceType.scan, 1),
                ]
            ):
                pathway.steps.append(
                    PathwayStep(
                        resource_type=rtype,
                        duration_minutes=blocks * 15,
                        block_count=blocks,
                        sequence_order=order,
                    )
                )
            db.add(pathway)
            db.commit()
            pathway_id = pathway.id
            admin_id = admin.id
            patient_id = patient.id

        with SessionLocal() as db:
            patient = db.get(User, patient_id)
            assert patient is not None
            booking = confirm_booking(
                db,
                patient,
                BookingCreateRequest(pathway_id=pathway_id, date=day, start_slot=8),
            )
            booked_slots = {
                (s.resource_type.value, s.slot_index)
                for s in booking.slots
                if s.resource_type.value != "gap"
            }
            assert booked_slots

            def assert_no_overlap(result) -> None:
                pathway_row = db.get(Pathway, pathway_id)
                assert pathway_row is not None
                requirement = build_requirement_array(pathway_row.steps)
                for start in result.feasible_starts:
                    footprint = {
                        (rtype, slot_index)
                        for slot_index, rtype in expand_booking_slots(requirement, start)
                        if rtype is not None
                    }
                    overlap = footprint & booked_slots
                    assert not overlap, (
                        f"feasible_start={start} overlaps existing booking at {overlap}"
                    )
                assert 8 not in result.feasible_starts

            # Happy path with valid resource_ids
            assert_no_overlap(search_booking(db, pathway_id, day))

            # Historical ghost-occupancy: null resource_ids. Drop check constraint
            # if present so we can reproduce the buggy data shape.
            db.execute(
                text(
                    "ALTER TABLE booking_slots "
                    "DROP CONSTRAINT IF EXISTS ck_booking_slots_resource_id_for_nongap"
                )
            )
            db.execute(
                text(
                    """
                    UPDATE booking_slots
                    SET resource_id = NULL
                    WHERE booking_id = :bid AND resource_type::text <> 'gap'
                    """
                ),
                {"bid": booking.id},
            )
            db.commit()

            used, _capacity, _ = build_used_matrix(db, day)
            for rtype, idx in booked_slots:
                assert used[RESOURCE_INDEX[rtype], idx] >= 1, (
                    f"engine must count occupancy for {rtype}@{idx} even with null resource_id"
                )

            assert_no_overlap(search_booking(db, pathway_id, day))

            # Restore integrity for other tests / shared DBs
            db.execute(
                text(
                    """
                    UPDATE booking_slots AS bs
                    SET resource_id = r.id
                    FROM (
                        SELECT DISTINCT ON (type) id, type
                        FROM resources
                        ORDER BY type, created_at ASC, id ASC
                    ) AS r
                    WHERE bs.booking_id = :bid
                      AND bs.resource_type::text <> 'gap'
                      AND bs.resource_type::text = r.type::text
                    """
                ),
                {"bid": booking.id},
            )
            db.execute(
                text(
                    "ALTER TABLE booking_slots "
                    "DROP CONSTRAINT IF EXISTS ck_booking_slots_resource_id_for_nongap"
                )
            )
            db.execute(
                text(
                    """
                    ALTER TABLE booking_slots
                    ADD CONSTRAINT ck_booking_slots_resource_id_for_nongap
                    CHECK (
                      (resource_type = 'gap' AND resource_id IS NULL)
                      OR (resource_type <> 'gap' AND resource_id IS NOT NULL)
                    )
                    """
                )
            )
            db.commit()
    finally:
        with SessionLocal() as db:
            if pathway_id is not None:
                booking_ids = list(
                    db.scalars(select(Booking.id).where(Booking.pathway_id == pathway_id)).all()
                )
                if booking_ids:
                    db.execute(delete(BookingSlot).where(BookingSlot.booking_id.in_(booking_ids)))
                    db.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
                db.execute(delete(PathwayStep).where(PathwayStep.pathway_id == pathway_id))
                db.execute(delete(Pathway).where(Pathway.id == pathway_id))
            user_ids = [uid for uid in (admin_id, patient_id) if uid is not None]
            if user_ids:
                db.execute(delete(User).where(User.id.in_(user_ids)))
            if created_resource_ids:
                db.execute(delete(Resource).where(Resource.id.in_(created_resource_ids)))
            db.commit()


def test_confirm_booking_rejects_missing_resource(test_engine) -> None:
    """confirm_booking must raise rather than write resource_id=None."""
    SessionLocal = sessionmaker(bind=test_engine)
    day = date.today() + timedelta(days=400 + (uuid4().int % 40))
    suffix = uuid4().hex[:8]
    admin_id = patient_id = pathway_id = None
    created_resource_ids: list = []

    try:
        with SessionLocal() as db:
            admin = User(
                email=f"admin-miss-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.admin,
                full_name="Admin Miss",
            )
            patient = User(
                email=f"pat-miss-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.patient,
                full_name="Patient Miss",
            )
            db.add_all([admin, patient])
            db.flush()
            _ensure_resources(db, created_resource_ids)

            pathway = Pathway(name=f"Miss-{suffix}", created_by=admin.id)
            pathway.steps.append(
                PathwayStep(
                    resource_type=StepResourceType.scan,
                    duration_minutes=15,
                    block_count=1,
                    sequence_order=0,
                )
            )
            db.add(pathway)
            db.commit()
            pathway_id = pathway.id
            admin_id = admin.id
            patient_id = patient.id

        with SessionLocal() as db:
            patient = db.get(User, patient_id)
            assert patient is not None
            used = np.zeros((len(RESOURCE_TYPES), SLOTS_PER_DAY), dtype=np.int16)
            capacity = np.ones(len(RESOURCE_TYPES), dtype=np.int16)
            doctor = db.scalar(select(Resource).where(Resource.type == ResourceType.doctor))
            nmt = db.scalar(select(Resource).where(Resource.type == ResourceType.nmt))
            assert doctor and nmt
            with patch(
                "app.services.booking_service.build_used_matrix",
                return_value=(used, capacity, {"doctor": doctor, "nmt": nmt}),
            ):
                with pytest.raises(ValueError, match="No resource configured"):
                    confirm_booking(
                        db,
                        patient,
                        BookingCreateRequest(pathway_id=pathway_id, date=day, start_slot=5),
                    )
    finally:
        with SessionLocal() as db:
            if pathway_id is not None:
                booking_ids = list(
                    db.scalars(select(Booking.id).where(Booking.pathway_id == pathway_id)).all()
                )
                if booking_ids:
                    db.execute(delete(BookingSlot).where(BookingSlot.booking_id.in_(booking_ids)))
                    db.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
                db.execute(delete(PathwayStep).where(PathwayStep.pathway_id == pathway_id))
                db.execute(delete(Pathway).where(Pathway.id == pathway_id))
            user_ids = [uid for uid in (admin_id, patient_id) if uid is not None]
            if user_ids:
                db.execute(delete(User).where(User.id.in_(user_ids)))
            if created_resource_ids:
                db.execute(delete(Resource).where(Resource.id.in_(created_resource_ids)))
            db.commit()
