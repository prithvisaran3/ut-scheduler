"""Add nurse to resource enums and insert the Nurse capacity row.

Revision ID: 0003_add_nurse
Revises: 0002_slot_resource_integrity
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_add_nurse"
down_revision = "0002_slot_resource_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot be used in the same transaction that consumes the new
    # label, so commit the enum change first.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'nurse'"))
        op.execute(sa.text("ALTER TYPE step_resource_type ADD VALUE IF NOT EXISTS 'nurse'"))

    op.execute(
        sa.text(
            """
            INSERT INTO resources (id, type, name, capacity)
            SELECT gen_random_uuid(), 'nurse', 'Nurse', 1
            WHERE NOT EXISTS (
                SELECT 1 FROM resources WHERE type::text = 'nurse'
            )
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM resources WHERE type::text = 'nurse'"))
    # Postgres cannot drop an enum value safely; leave the labels in place.
