from datetime import datetime
from pydantic import BaseModel
from app.models.payment import PaymentStatus


class PaymentCreate(BaseModel):
    order_id: str
    amount: float


class PaymentResponse(BaseModel):
    id: str
    order_id: str
    amount: float
    status: PaymentStatus
    provider_ref: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentListResponse(BaseModel):
    items: list[PaymentResponse]
    total: int


class PaymentStatusUpdate(BaseModel):
    status: PaymentStatus


class PaymentStats(BaseModel):
    total: int
    by_status: dict[str, int]
    revenue: float
