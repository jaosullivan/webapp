"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-28
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

order_status = sa.Enum("pending", "confirmed", "shipped", "delivered", "cancelled", name="orderstatus")


def upgrade() -> None:
    order_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "orders",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("status", order_status, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_user_id", table_name="orders")
    op.drop_table("orders")
    order_status.drop(op.get_bind(), checkfirst=True)
