"""Vehicle CRUD for the authenticated user."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user
from app.models import User, UserRole, Vehicle
from app.schemas.vehicle import VehicleCreateRequest, VehiclePublic, VehicleUpdateRequest

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehiclePublic])
async def list_my_vehicles(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> list[VehiclePublic]:
    rows = await session.scalars(
        select(Vehicle)
        .where(Vehicle.owner_id == user.id)
        .order_by(Vehicle.is_primary.desc(), Vehicle.created_at.desc())
    )
    return [VehiclePublic.model_validate(vehicle) for vehicle in rows]


@router.post("", response_model=VehiclePublic, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> VehiclePublic:
    if payload.is_primary:
        await session.execute(
            update(Vehicle).where(Vehicle.owner_id == user.id).values(is_primary=False)
        )

    vehicle = Vehicle(
        owner_id=user.id,
        brand=payload.brand,
        model=payload.model,
        color=payload.color,
        plate=payload.plate.upper(),
        seats_total=payload.seats_total,
        is_primary=payload.is_primary,
    )
    session.add(vehicle)
    if user.role == UserRole.PASSENGER:
        user.role = UserRole.DRIVER

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce véhicule existe déjà pour votre compte.",
        ) from exc
    await session.refresh(vehicle)
    return VehiclePublic.model_validate(vehicle)


@router.patch("/{vehicle_id}", response_model=VehiclePublic)
async def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> VehiclePublic:
    vehicle = await session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.owner_id == user.id)
    )
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Véhicule introuvable.")

    if payload.brand is not None:
        vehicle.brand = payload.brand
    if payload.model is not None:
        vehicle.model = payload.model
    if "color" in payload.model_fields_set:
        vehicle.color = payload.color
    if payload.plate is not None:
        vehicle.plate = payload.plate.upper()
    if payload.seats_total is not None:
        vehicle.seats_total = payload.seats_total
    if payload.is_active is not None:
        vehicle.is_active = payload.is_active

    if payload.is_primary is True:
        await session.execute(
            update(Vehicle)
            .where(Vehicle.owner_id == user.id, Vehicle.id != vehicle.id)
            .values(is_primary=False)
        )
        vehicle.is_primary = True
    elif payload.is_primary is False:
        vehicle.is_primary = False

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflit sur les données du véhicule.",
        ) from exc
    await session.refresh(vehicle)
    return VehiclePublic.model_validate(vehicle)


@router.delete("/{vehicle_id}", response_model=dict[str, str])
async def delete_vehicle(
    vehicle_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> dict[str, str]:
    vehicle = await session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.owner_id == user.id)
    )
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Véhicule introuvable.")

    vehicle.is_active = False
    vehicle.is_primary = False
    await session.commit()
    return {"message": "Véhicule supprimé."}
