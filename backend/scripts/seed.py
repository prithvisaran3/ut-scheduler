"""Seed demo users, resources, and today's availability blocks — no pathways.

Run from backend/:  python -m scripts.seed
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

# Allow `python scripts/seed.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select

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
    db.execute(delete(BookingSlot))
    db.execute(delete(Booking))
    db.execute(delete(AvailabilityBlock))
    db.execute(delete(PathwayStep))
    db.execute(delete(Pathway))
    db.execute(delete(Resource))
    db.execute(delete(User))
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

        doctor = Resource(type=ResourceType.doctor, name="Doctor", capacity=1)
        nmt = Resource(type=ResourceType.nmt, name="NMT", capacity=1)
        scan = Resource(type=ResourceType.scan, name="Scan", capacity=1)
        db.add_all([doctor, nmt, scan])
        db.flush()

        today = date.today()

        # Morning / midday occupancy that still leaves a clear afternoon window
        # for a live-created Pathway 1 (9 blocks / 4h 30m) to fit.
        # Doctor: early morning + late-morning cluster (08:00–10:00, 11:00–12:00)
        doctor_slots = [0, 1, 2, 3, 6, 7]
        # NMT dose-prep (09:00–10:00)
        nmt_slots = [2, 3]
        # Scan camera block (10:00–11:00)
        scan_slots = [4, 5]

        for idx in doctor_slots:
            db.add(
                AvailabilityBlock(
                    resource_id=doctor.id,
                    date=today,
                    slot_index=idx,
                    created_by=admin.id,
                    reason="clinic_block",
                )
            )
        for idx in nmt_slots:
            db.add(
                AvailabilityBlock(
                    resource_id=nmt.id,
                    date=today,
                    slot_index=idx,
                    created_by=admin.id,
                    reason="dose_prep",
                )
            )
        for idx in scan_slots:
            db.add(
                AvailabilityBlock(
                    resource_id=scan.id,
                    date=today,
                    slot_index=idx,
                    created_by=admin.id,
                    reason="camera_maintenance",
                )
            )

        db.commit()

        n_users = db.scalar(select(func.count()).select_from(User)) or 0
        n_resources = db.scalar(select(func.count()).select_from(Resource)) or 0
        n_pathways = db.scalar(select(func.count()).select_from(Pathway)) or 0
        n_bookings = db.scalar(select(func.count()).select_from(Booking)) or 0
        n_blocks = db.scalar(select(func.count()).select_from(AvailabilityBlock)) or 0

        print("=" * 60)
        print("UT Scheduler seed complete")
        print("=" * 60)
        print(f"Admin:   {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print(f"Patient: {PATIENT_EMAIL} / {DEMO_PASSWORD}")
        print(f"Today:   {today.isoformat()}")
        print(f"users={n_users} resources={n_resources} pathways={n_pathways} "
              f"bookings={n_bookings} availability_blocks={n_blocks}")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
