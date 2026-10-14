"""Trip publication tables.

Revision ID: 002_trips_publication
Revises: 001_phase2_auth_users_vehicles
Create Date: 2026-10-13 08:30:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "002_trips_publication"
down_revision = "001_phase2_auth_users_vehicles"
branch_labels = None
depends_on = None


trip_status = postgresql.ENUM(
    "scheduled",
    "cancelled",
    "completed",
    name="trip_status",
    create_type=False,
)


def upgrade() -> None:
    trip_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("origin_label", sa.String(length=160), nullable=False),
        sa.Column("destination_label", sa.String(length=160), nullable=False),
        sa.Column("origin_lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("origin_lng", sa.Numeric(9, 6), nullable=False),
        sa.Column("destination_lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("destination_lng", sa.Numeric(9, 6), nullable=False),
        sa.Column("departure_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seats_total", sa.Integer(), nullable=False),
        sa.Column("seats_available", sa.Integer(), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("price_per_seat_cents", sa.Integer(), nullable=True),
        sa.Column(
            "max_detour_ratio",
            sa.Numeric(4, 2),
            nullable=False,
            server_default=sa.text("0.30"),
        ),
        sa.Column("driver_preferences", sa.Text(), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("status", trip_status, nullable=False, server_default="scheduled"),
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
            "seats_total >= 1 AND seats_total <= 9",
            name="ck_trips_seats_total_range",
        ),
        sa.CheckConstraint(
            "seats_available >= 0 AND seats_available <= seats_total",
            name="ck_trips_seats_available_range",
        ),
        sa.CheckConstraint(
            "origin_lat >= -90 AND origin_lat <= 90 "
            "AND destination_lat >= -90 AND destination_lat <= 90",
            name="ck_trips_latitude_range",
        ),
        sa.CheckConstraint(
            "origin_lng >= -180 AND origin_lng <= 180 "
            "AND destination_lng >= -180 AND destination_lng <= 180",
            name="ck_trips_longitude_range",
        ),
        sa.CheckConstraint(
            "(is_paid = false AND price_per_seat_cents IS NULL) OR "
            "(is_paid = true AND price_per_seat_cents IS NOT NULL AND price_per_seat_cents >= 0)",
            name="ck_trips_price_rule",
        ),
        sa.CheckConstraint(
            "max_detour_ratio >= 0 AND max_detour_ratio <= 1",
            name="ck_trips_detour_ratio_range",
        ),
        sa.ForeignKeyConstraint(
            ["driver_id"],
            ["users.id"],
            name=op.f("fk_trips_driver_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            name=op.f("fk_trips_vehicle_id_vehicles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trips")),
    )
    op.create_index(
        "ix_trips_driver_departure", "trips", ["driver_id", "departure_time"], unique=False
    )
    op.create_index(
        "ix_trips_status_departure", "trips", ["status", "departure_time"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_trips_status_departure", table_name="trips")
    op.drop_index("ix_trips_driver_departure", table_name="trips")
    op.drop_table("trips")
    trip_status.drop(op.get_bind(), checkfirst=True)
