from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.schemas.order import OrderCreate, OrderResponse, OrderListResponse, OrderStatusUpdate, OrderStats
from shared.auth import get_current_user_id

router = APIRouter(dependencies=[Depends(get_current_user_id)])


@router.post("/orders", response_model=OrderResponse, status_code=201)
async def create_order(body: OrderCreate, db: AsyncSession = Depends(get_db)):
    order = Order(user_id=body.user_id, total=body.total)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("/orders", response_model=OrderListResponse)
async def list_orders(skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Order))
    result = await db.execute(
        select(Order).order_by(Order.created_at.desc()).offset(skip).limit(limit)
    )
    return {"items": result.scalars().all(), "total": total or 0}


@router.get("/orders/stats", response_model=OrderStats)
async def get_order_stats(db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Order)) or 0
    total_value = await db.scalar(select(func.sum(Order.total)).select_from(Order)) or 0.0
    by_status = {s.value: 0 for s in OrderStatus}
    rows = await db.execute(
        select(Order.status, func.count()).group_by(Order.status)
    )
    for status, count in rows:
        by_status[status.value] = count
    return OrderStats(total=total, by_status=by_status, total_value=float(total_value))


@router.get("/orders/user/{user_id}", response_model=list[OrderResponse])
async def get_user_orders(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc())
    )
    return result.scalars().all()


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(order_id: str, body: OrderStatusUpdate, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = body.status
    await db.commit()
    await db.refresh(order)
    return order
