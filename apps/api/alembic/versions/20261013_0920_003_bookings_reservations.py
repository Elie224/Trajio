"""Bookings reservation tables.

Revision ID: 003_bookings_reservations
Revises: 002_trips_publication
Create Date: 2026-10-13 09:20:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "003_bookings_reservations"
down_revision = "002_trips_publication"
branch_labels = None
depends_on = None


booking_status = postgresql.ENUM(
    "pending",
    "accepted",
    "declined",
    "cancelled",
    name="booking_status",
    create_type=False,
)


def upgrade() -> None:
    booking_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("passenger_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_seats", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", booking_status, nullable=False, server_default="pending"),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "requested_seats >= 1 AND requested_seats <= 9",
            name="ck_bookings_requested_seats_range",
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"],
            ["trips.id"],
            name=op.f("fk_bookings_trip_id_trips"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["passenger_id"],
            ["users.id"],
            name=op.f("fk_bookings_passenger_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookings")),
    )
    op.create_index(
        "ix_bookings_passenger_created", "bookings", ["passenger_id", "created_at"], unique=False
    )
    op.create_index("ix_bookings_trip_status", "bookings", ["trip_id", "status"], unique=False)
    op.create_index(
        "uq_bookings_trip_passenger_active",
        "bookings",
        ["trip_id", "passenger_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'accepted')"),
    )


def downgrade() -> None:
    op.drop_index("uq_bookings_trip_passenger_active", table_name="bookings")
    op.drop_index("ix_bookings_trip_status", table_name="bookings")
    op.drop_index("ix_bookings_passenger_created", table_name="bookings")
    op.drop_table("bookings")
    booking_status.drop(op.get_bind(), checkfirst=True)
