"""Session version on users, to revoke access tokens on reset or deletion.

Revision ID: 005_user_token_version
Revises: 004_user_password_changed_at
Create Date: 2026-10-14 22:30:00
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "005_user_token_version"
down_revision = "004_user_password_changed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
