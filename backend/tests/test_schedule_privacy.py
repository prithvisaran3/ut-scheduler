"""Patient schedule responses must never leak identity fields."""

from __future__ import annotations

import os
from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.db.url import with_sslmode_require
from app.models.booking import Booking, BookingSlot
from app.models.pathway import Pathway, PathwayStep, StepResourceType
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.schemas.booking import BookingCreateRequest
from app.services.booking_service import confirm_booking
from app.services.schedule_service import build_day_matrix


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


def test_patient_schedule_has_gap_column_no_identity(test_engine) -> None:
    SessionLocal = sessionmaker(bind=test_engine)
    day = date.today() + timedelta(days=350 + (uuid4().int % 40))
    # Prefer a weekday so confirm isn't rejected by weekend rules.
    while day.weekday() >= 5:
        day += timedelta(days=1)
    suffix = uuid4().hex[:8]
    admin_id = patient_id = other_id = pathway_id = None
    created_resource_ids: list = []

    try:
        with SessionLocal() as db:
            admin = User(
                email=f"admin-priv-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.admin,
                full_name="Admin Priv",
            )
            patient = User(
                email=f"pat-priv-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.patient,
                full_name="Secret Patient",
            )
            other = User(
                email=f"other-priv-{suffix}@test.com",
                password_hash=hash_password("test-pass-123"),
                role=UserRole.patient,
                full_name="Other Viewer",
            )
            db.add_all([admin, patient, other])
            db.flush()
            for rtype, name in [
                (ResourceType.doctor, "Doctor"),
                (ResourceType.nmt, "NMT"),
                (ResourceType.scan, "Scan"),
            ]:
                existing = db.scalar(select(Resource).where(Resource.type == rtype))
                if existing is None:
                    res = Resource(type=rtype, name=name, capacity=1)
                    db.add(res)
                    db.flush()
                    created_resource_ids.append(res.id)

            pathway = Pathway(name=f"Priv-{suffix}", created_by=admin.id)
            pathway.steps.append(
                PathwayStep(
                    resource_type=StepResourceType.doctor,
                    duration_minutes=15,
                    block_count=1,
                    sequence_order=0,
                )
            )
            pathway.steps.append(
                PathwayStep(
                    resource_type=StepResourceType.gap,
                    duration_minutes=30,
                    block_count=2,
                    sequence_order=1,
                )
            )
            pathway.steps.append(
                PathwayStep(
                    resource_type=StepResourceType.scan,
                    duration_minutes=15,
                    block_count=1,
                    sequence_order=2,
                )
            )
            db.add(pathway)
            db.commit()
            pathway_id = pathway.id
            admin_id = admin.id
            patient_id = patient.id
            other_id = other.id

        with SessionLocal() as db:
            booked = db.get(User, patient_id)
            assert booked is not None
            confirm_booking(
                db,
                booked,
                BookingCreateRequest(pathway_id=pathway_id, date=day, start_slot=4),
            )

            viewer = db.get(User, other_id)
            admin = db.get(User, admin_id)
            assert viewer and admin

            patient_day = build_day_matrix(db, day, viewer)
            assert [c.resource_type for c in patient_day.columns] == [
                "doctor",
                "nmt",
                "gap",
                "scan",
            ]
            # No Patient column for patients.
            assert all(c.resource_type != "patient" for c in patient_day.columns)
            gap_col = next(c for c in patient_day.columns if c.resource_type == "gap")
            # Other patient's gaps must never appear.
            assert all(s.occupied == 0 for s in gap_col.slots)
            doctor = next(c for c in patient_day.columns if c.resource_type == "doctor")
            assert any(s.occupied > 0 for s in doctor.slots)

            payload = patient_day.model_dump(mode="json")
            blob = str(payload)
            assert "Secret Patient" not in blob
            assert f"Priv-{suffix}" not in blob
            for col in patient_day.columns:
                for slot in col.slots:
                    assert slot.occupants == []

            # Own booking gaps appear only for the booked patient.
            own_day = build_day_matrix(db, day, booked)
            assert [c.resource_type for c in own_day.columns] == [
                "doctor",
                "nmt",
                "gap",
                "scan",
            ]
            own_gap = next(c for c in own_day.columns if c.resource_type == "gap")
            assert any(s.occupied > 0 and s.is_uptake for s in own_gap.slots)

            admin_day = build_day_matrix(db, day, admin)
            assert [c.resource_type for c in admin_day.columns] == [
                "doctor",
                "nmt",
                "patient",
                "scan",
            ]
            assert next(c for c in admin_day.columns if c.resource_type == "patient").name == "Patient"
            names = {
                o.patient_name
                for c in admin_day.columns
                for s in c.slots
                for o in s.occupants
                if o.patient_name
            }
            assert "Secret Patient" in names
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
            user_ids = [uid for uid in (admin_id, patient_id, other_id) if uid is not None]
            if user_ids:
                db.execute(delete(User).where(User.id.in_(user_ids)))
            if created_resource_ids:
                db.execute(delete(Resource).where(Resource.id.in_(created_resource_ids)))
            db.commit()
