"""Track the last password change, to invalidate older access tokens.

Revision ID: 004_user_password_changed_at
Revises: 003_bookings_reservations
Create Date: 2026-10-14 20:40:00
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "004_user_password_changed_at"
down_revision = "003_bookings_reservations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
