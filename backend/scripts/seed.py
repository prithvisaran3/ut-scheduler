"""Seed ONLY the two login accounts and four capacity resources.

STANDING RULE — production / live verification hygiene
-----------------------------------------------------
Never leave verification artifacts in the production database.
When verifying end-to-end against live data:
  - Use the two seeded accounts (admin@unithera.com, prithvi@unithera.com)
  - If a throwaway account, booking, or pathway is required, delete it in
    the same task and confirm deletion in the report
  - Never create records named like "Verify Patient", "Test User",
    "Conc-<hex>", or other placeholder labels — if those appear in the UI,
    something leaked

This script deliberately seeds:
  - 2 users (admin + patient)
  - 4 resources (doctor, nmt, scan, nurse @ capacity 1)
and NOTHING else — no pathways, bookings, or availability blocks.

Run from backend/:  python -m scripts.seed
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/seed.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select, text

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.availability_block import AvailabilityBlock
from app.models.booking import Booking, BookingSlot
from app.models.pathway import Pathway, PathwayStep
from app.models.resource import Resource, ResourceType
from app.models.user import User, UserRole

ADMIN_EMAIL = "admin@unithera.com"
PATIENT_EMAIL = "prithvi@unithera.com"
DEMO_PASSWORD = "Theranostics2026!"


def _clear(db) -> None:
    """Wipe all app data so seed is the sole source of truth."""
    db.execute(delete(BookingSlot))
    db.execute(delete(Booking))
    db.execute(delete(AvailabilityBlock))
    db.execute(delete(PathwayStep))
    db.execute(delete(Pathway))
    db.execute(delete(Resource))
    db.execute(delete(User))
    db.execute(text("DELETE FROM audit_logs"))
    db.commit()


def seed() -> None:
    db = SessionLocal()
    try:
        _clear(db)

        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.admin,
            full_name="Prithvi Admin",
        )
        patient = User(
            email=PATIENT_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.patient,
            full_name="Prithvi Saran",
        )
        db.add_all([admin, patient])
        db.flush()

        db.add_all(
            [
                Resource(type=ResourceType.doctor, name="Doctor", capacity=1),
                Resource(type=ResourceType.nmt, name="NMT", capacity=1),
                Resource(type=ResourceType.scan, name="Scan", capacity=1),
                Resource(type=ResourceType.nurse, name="Nurse", capacity=1),
            ]
        )
        db.commit()

        n_users = db.scalar(select(func.count()).select_from(User)) or 0
        n_resources = db.scalar(select(func.count()).select_from(Resource)) or 0
        n_pathways = db.scalar(select(func.count()).select_from(Pathway)) or 0
        n_bookings = db.scalar(select(func.count()).select_from(Booking)) or 0
        n_slots = db.scalar(select(func.count()).select_from(BookingSlot)) or 0
        n_blocks = db.scalar(select(func.count()).select_from(AvailabilityBlock)) or 0
        emails = sorted(db.scalars(select(User.email)).all())

        print("=" * 60)
        print("UT Scheduler seed complete (accounts + resources only)")
        print("=" * 60)
        print(f"Admin:   {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print(f"Patient: {PATIENT_EMAIL} / {DEMO_PASSWORD}")
        print(f"users={n_users} resources={n_resources} pathways={n_pathways}")
        print(f"bookings={n_bookings} booking_slots={n_slots} availability_blocks={n_blocks}")
        print(f"user_emails={emails}")
        print("=" * 60)

        assert n_users == 2 and emails == [ADMIN_EMAIL, PATIENT_EMAIL]
        assert n_resources == 4
        assert n_pathways == 0 and n_bookings == 0 and n_slots == 0 and n_blocks == 0
    finally:
        db.close()


if __name__ == "__main__":
    seed()
