from datetime import datetime
from pydantic import BaseModel
from app.models.order import OrderStatus


class OrderCreate(BaseModel):
    user_id: str
    total: float


class OrderResponse(BaseModel):
    id: str
    user_id: str
    total: float
    status: OrderStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    items: list[OrderResponse]
    total: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderStats(BaseModel):
    total: int
    by_status: dict[str, int]
    total_value: float
