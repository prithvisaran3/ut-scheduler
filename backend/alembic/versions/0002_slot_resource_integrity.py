"""Backfill booking slot resource_ids, dedupe resources, add integrity constraints.

Revision ID: 0002_slot_resource_integrity
Revises: 0001_initial
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_slot_resource_integrity"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- Backfill null resource_id on non-gap booking slots ---
    # Prefer the oldest resource row per type as canonical.
    conn.execute(
        sa.text(
            """
            UPDATE booking_slots AS bs
            SET resource_id = r.id
            FROM (
                SELECT DISTINCT ON (type) id, type
                FROM resources
                ORDER BY type, created_at ASC, id ASC
            ) AS r
            WHERE bs.resource_id IS NULL
              AND bs.resource_type::text <> 'gap'
              AND bs.resource_type::text = r.type::text
            """
        )
    )

    unresolved = conn.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM booking_slots
            WHERE resource_type::text <> 'gap' AND resource_id IS NULL
            """
        )
    ).scalar()
    if unresolved and int(unresolved) > 0:
        raise RuntimeError(
            f"Cannot add check constraint: {unresolved} non-gap booking_slots "
            "still have null resource_id and no matching Resource row"
        )

    # --- Dedupe resources: keep oldest per type, repoint FKs, delete extras ---
    dup_types = conn.execute(
        sa.text(
            """
            SELECT type::text FROM resources
            GROUP BY type HAVING COUNT(*) > 1
            """
        )
    ).fetchall()
    for (rtype,) in dup_types:
        rows = conn.execute(
            sa.text(
                """
                SELECT id FROM resources
                WHERE type::text = :t
                ORDER BY created_at ASC, id ASC
                """
            ),
            {"t": rtype},
        ).fetchall()
        keep_id = rows[0][0]
        drop_ids = [r[0] for r in rows[1:]]
        for drop_id in drop_ids:
            conn.execute(
                sa.text(
                    """
                    UPDATE booking_slots SET resource_id = :keep
                    WHERE resource_id = :drop
                    """
                ),
                {"keep": keep_id, "drop": drop_id},
            )
            # Merge availability blocks: prefer keep when both exist for same slot.
            conn.execute(
                sa.text(
                    """
                    DELETE FROM availability_blocks AS ab
                    WHERE ab.resource_id = :drop
                      AND EXISTS (
                        SELECT 1 FROM availability_blocks k
                        WHERE k.resource_id = :keep
                          AND k.date = ab.date
                          AND k.slot_index = ab.slot_index
                      )
                    """
                ),
                {"keep": keep_id, "drop": drop_id},
            )
            conn.execute(
                sa.text(
                    """
                    UPDATE availability_blocks SET resource_id = :keep
                    WHERE resource_id = :drop
                    """
                ),
                {"keep": keep_id, "drop": drop_id},
            )
            conn.execute(
                sa.text("DELETE FROM resources WHERE id = :drop"),
                {"drop": drop_id},
            )

    op.create_check_constraint(
        "ck_booking_slots_resource_id_for_nongap",
        "booking_slots",
        "(resource_type = 'gap' AND resource_id IS NULL) OR "
        "(resource_type <> 'gap' AND resource_id IS NOT NULL)",
    )
    op.create_unique_constraint("uq_resources_type", "resources", ["type"])


def downgrade() -> None:
    op.drop_constraint("uq_resources_type", "resources", type_="unique")
    op.drop_constraint(
        "ck_booking_slots_resource_id_for_nongap", "booking_slots", type_="check"
    )
