"""Initial schema — users, resources, pathways, availability, bookings, audit."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

user_role = postgresql.ENUM("admin", "patient", name="user_role", create_type=False)
resource_type = postgresql.ENUM("doctor", "nmt", "scan", name="resource_type", create_type=False)
step_resource_type = postgresql.ENUM(
    "doctor", "nmt", "gap", "scan", name="step_resource_type", create_type=False
)
booking_status = postgresql.ENUM("confirmed", "cancelled", name="booking_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    resource_type.create(bind, checkfirst=True)
    step_resource_type.create(bind, checkfirst=True)
    booking_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("type", resource_type, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "pathways",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "pathway_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pathway_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pathways.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("resource_type", step_resource_type, nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("block_count", sa.Integer(), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
    )
    op.create_index("ix_pathway_steps_pathway_id", "pathway_steps", ["pathway_id"])

    op.create_table(
        "availability_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "resource_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("resource_id", "date", "slot_index", name="uq_availability_block_slot"),
    )
    op.create_index("ix_availability_blocks_date", "availability_blocks", ["date"])
    op.create_index("ix_availability_blocks_resource_id", "availability_blocks", ["resource_id"])

    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("pathway_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pathways.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_slot", sa.Integer(), nullable=False),
        sa.Column("status", booking_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_bookings_patient_id", "bookings", ["patient_id"])
    op.create_index("ix_bookings_pathway_id", "bookings", ["pathway_id"])
    op.create_index("ix_bookings_date", "bookings", ["date"])

    op.create_table(
        "booking_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("resources.id"), nullable=True),
        sa.Column("resource_type", step_resource_type, nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
    )
    op.create_index("ix_booking_slots_booking_id", "booking_slots", ["booking_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("booking_slots")
    op.drop_table("bookings")
    op.drop_table("availability_blocks")
    op.drop_table("pathway_steps")
    op.drop_table("pathways")
    op.drop_table("resources")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    booking_status.drop(bind, checkfirst=True)
    step_resource_type.drop(bind, checkfirst=True)
    resource_type.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)
