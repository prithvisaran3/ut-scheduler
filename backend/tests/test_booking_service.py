"""Concurrency: two confirms for the same slot — exactly one succeeds."""

from __future__ import annotations

import threading
from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.db.url import with_sslmode_require
from app.models.booking import Booking, BookingStatus
from app.models.pathway import Pathway, PathwayStep, StepResourceType
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole
from app.schemas.booking import BookingCreateRequest
from app.services.booking_service import BookingConflictError, confirm_booking


@pytest.fixture(scope="module")
def db_available() -> bool:
    try:
        engine = create_engine(with_sslmode_require(settings.database_url), pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        return True
    except Exception:
        return False


def test_concurrent_booking_only_one_succeeds(db_available: bool) -> None:
    if not db_available:
        pytest.skip("DATABASE_URL not reachable")

    engine = create_engine(with_sslmode_require(settings.database_url), pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    # Unique far-future day so seed data cannot interfere
    day = date.today() + timedelta(days=120 + (uuid4().int % 200))
    suffix = uuid4().hex[:8]

    with SessionLocal() as db:
        admin = User(
            email=f"admin-c-{suffix}@test.com",
            password_hash=hash_password("test-pass-123"),
            role=UserRole.admin,
            full_name="Admin C",
        )
        p1 = User(
            email=f"p1-{suffix}@test.com",
            password_hash=hash_password("test-pass-123"),
            role=UserRole.patient,
            full_name="P1",
        )
        p2 = User(
            email=f"p2-{suffix}@test.com",
            password_hash=hash_password("test-pass-123"),
            role=UserRole.patient,
            full_name="P2",
        )
        db.add_all([admin, p1, p2])
        db.flush()
        for rtype, name in [
            (ResourceType.doctor, "Doctor"),
            (ResourceType.nmt, "NMT"),
            (ResourceType.scan, "Scan"),
        ]:
            existing = db.scalar(select(Resource).where(Resource.type == rtype))
            if existing is None:
                db.add(Resource(type=rtype, name=name, capacity=1))
        pathway = Pathway(name=f"Conc-{suffix}", created_by=admin.id)
        pathway.steps.append(
            PathwayStep(
                resource_type=StepResourceType.doctor,
                duration_minutes=30,
                block_count=1,
                sequence_order=0,
            )
        )
        db.add(pathway)
        db.commit()
        pathway_id = pathway.id
        p1_id = p1.id
        p2_id = p2.id

    results: list[str] = []
    lock = threading.Lock()
    barrier = threading.Barrier(2)

    def attempt(user_id) -> None:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            assert user is not None
            barrier.wait(timeout=10)
            try:
                confirm_booking(
                    db,
                    user,
                    BookingCreateRequest(pathway_id=pathway_id, date=day, start_slot=10),
                )
                with lock:
                    results.append("ok")
            except BookingConflictError:
                with lock:
                    results.append("conflict")
            except Exception as exc:  # noqa: BLE001
                with lock:
                    results.append(f"err:{type(exc).__name__}:{exc}")

    t1 = threading.Thread(target=attempt, args=(p1_id,))
    t2 = threading.Thread(target=attempt, args=(p2_id,))
    t1.start()
    t2.start()
    t1.join(timeout=30)
    t2.join(timeout=30)

    assert sorted(results) == ["conflict", "ok"], results

    with SessionLocal() as db:
        n = len(
            db.scalars(
                select(Booking).where(
                    Booking.pathway_id == pathway_id,
                    Booking.date == day,
                    Booking.status == BookingStatus.confirmed,
                )
            ).all()
        )
        assert n == 1
