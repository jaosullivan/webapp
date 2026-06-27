import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.payment import Payment, PaymentStatus
from app.schemas.payment import PaymentCreate, PaymentResponse, PaymentListResponse, PaymentStatusUpdate, PaymentStats

router = APIRouter()


@router.post("/payments", response_model=PaymentResponse, status_code=201)
async def create_payment(body: PaymentCreate, db: AsyncSession = Depends(get_db)):
    payment = Payment(order_id=body.order_id, amount=body.amount)
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Payment))
    result = await db.execute(
        select(Payment).order_by(Payment.created_at.desc()).offset(skip).limit(limit)
    )
    return {"items": result.scalars().all(), "total": total or 0}


@router.post("/payments/{payment_id}/process", response_model=PaymentResponse)
async def process_payment(payment_id: str, db: AsyncSession = Depends(get_db)):
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = PaymentStatus.completed
    if not payment.provider_ref:
        payment.provider_ref = str(uuid.uuid4())
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/payments/stats", response_model=PaymentStats)
async def get_payment_stats(db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Payment)) or 0
    by_status = {s.value: 0 for s in PaymentStatus}
    rows = await db.execute(
        select(Payment.status, func.count()).group_by(Payment.status)
    )
    for status, count in rows:
        by_status[status.value] = count
    revenue = await db.scalar(
        select(func.sum(Payment.amount)).where(Payment.status == PaymentStatus.completed)
    ) or 0.0
    return PaymentStats(total=total, by_status=by_status, revenue=float(revenue))


@router.patch("/payments/{payment_id}/status", response_model=PaymentResponse)
async def update_payment_status(payment_id: str, body: PaymentStatusUpdate, db: AsyncSession = Depends(get_db)):
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = body.status
    if body.status == PaymentStatus.completed and not payment.provider_ref:
        payment.provider_ref = str(uuid.uuid4())
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(payment_id: str, db: AsyncSession = Depends(get_db)):
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment
