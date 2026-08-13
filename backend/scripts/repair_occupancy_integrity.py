"""Audit & repair booking_slot resource_ids and duplicate resources.

Run from backend/:
  python -m scripts.repair_occupancy_integrity

Reports counts, backfills null resource_ids from Resource by type, dedupes
resources (oldest kept), and fails loudly if any non-gap slot cannot be resolved.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.url import with_sslmode_require
from app.models.availability_block import AvailabilityBlock
from app.models.booking import BookingSlot
from app.models.resource import Resource
from app.services.schedule_service import find_duplicate_resources, get_resources_by_type


def audit_and_repair(db: Session) -> None:
    null_slots = db.scalars(
        select(BookingSlot).where(
            BookingSlot.resource_type != "gap",  # type: ignore[arg-type]
            BookingSlot.resource_id.is_(None),
        )
    ).all()
    # Enum compare — use SQL for reliability
    null_rows = db.execute(
        text(
            """
            SELECT id::text, booking_id::text, resource_type::text, slot_index
            FROM booking_slots
            WHERE resource_type::text <> 'gap' AND resource_id IS NULL
            """
        )
    ).fetchall()
    print(f"null_resource_id non-gap slots: {len(null_rows)}")
    for row in null_rows[:50]:
        print(f"  slot id={row[0]} booking={row[1]} type={row[2]} idx={row[3]}")

    by_type = get_resources_by_type(db)
    unresolved: list = []
    repaired = 0
    for row in null_rows:
        slot_id, _booking_id, rtype, _idx = row
        res = by_type.get(rtype)
        if res is None:
            unresolved.append(row)
            continue
        db.execute(
            text("UPDATE booking_slots SET resource_id = :rid WHERE id = :sid"),
            {"rid": res.id, "sid": slot_id},
        )
        repaired += 1
    print(f"backfilled: {repaired}")
    if unresolved:
        print(f"UNRESOLVED (no Resource for type): {len(unresolved)}")
        for row in unresolved:
            print(f"  {row}")

    dups = find_duplicate_resources(db)
    print(f"duplicate resource types: {list(dups.keys()) or 'none'}")
    for rtype, rows in dups.items():
        keep = rows[0]
        print(f"  {rtype}: keep={keep.id} drop={[r.id for r in rows[1:]]}")
        for drop in rows[1:]:
            db.execute(
                text("UPDATE booking_slots SET resource_id = :k WHERE resource_id = :d"),
                {"k": keep.id, "d": drop.id},
            )
            # Drop colliding availability blocks, then repoint
            db.execute(
                text(
                    """
                    DELETE FROM availability_blocks AS ab
                    WHERE ab.resource_id = :d
                      AND EXISTS (
                        SELECT 1 FROM availability_blocks k
                        WHERE k.resource_id = :k
                          AND k.date = ab.date AND k.slot_index = ab.slot_index
                      )
                    """
                ),
                {"k": keep.id, "d": drop.id},
            )
            db.execute(
                text("UPDATE availability_blocks SET resource_id = :k WHERE resource_id = :d"),
                {"k": keep.id, "d": drop.id},
            )
            db.delete(drop)
        print(f"  deduped {rtype}")

    remaining = db.execute(
        text(
            """
            SELECT COUNT(*) FROM booking_slots
            WHERE resource_type::text <> 'gap' AND resource_id IS NULL
            """
        )
    ).scalar()
    print(f"remaining null non-gap: {remaining}")
    if remaining and int(remaining) > 0:
        db.rollback()
        raise SystemExit(1)
    db.commit()
    print("repair committed")


def main() -> None:
    engine = create_engine(with_sslmode_require(settings.database_url), pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    with SessionLocal() as db:
        audit_and_repair(db)


if __name__ == "__main__":
    main()
