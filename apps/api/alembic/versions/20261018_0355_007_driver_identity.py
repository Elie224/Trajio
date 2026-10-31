"""Driver identity verification columns.

Revision ID: 007_driver_identity
Revises: 006_trust_messaging
Create Date: 2026-10-18 03:55:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "007_driver_identity"
down_revision = "006_trust_messaging"
branch_labels = None
depends_on = None

id_document_status = postgresql.ENUM(
    "pending",
    "verified",
    "rejected",
    name="id_document_status",
    create_type=False,
)


def upgrade() -> None:
    id_document_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users", sa.Column("license_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "id_document_status",
            id_document_status,
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "id_document_status")
    op.drop_column("users", "license_verified_at")
    op.drop_column("users", "phone_verified_at")
    id_document_status.drop(op.get_bind(), checkfirst=True)
