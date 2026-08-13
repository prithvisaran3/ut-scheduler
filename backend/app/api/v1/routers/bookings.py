from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.booking import BookingCreateRequest, BookingOut, BookingSearchRequest, BookingSearchResponse
from app.services import booking_service
from app.services.booking_service import BookingConflictError

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/search", response_model=BookingSearchResponse)
def search_bookings(
    body: BookingSearchRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> BookingSearchResponse:
    try:
        return booking_service.search_booking(db, body.pathway_id, body.date)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    body: BookingCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("patient", "admin")),
) -> BookingOut:
    try:
        return booking_service.confirm_booking(db, user, body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BookingConflictError as exc:
        raise booking_service.conflict_http(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/mine", response_model=list[BookingOut])
def my_bookings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BookingOut]:
    return booking_service.list_my_bookings(db, user.id)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        booking_service.cancel_booking(db, booking_id, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
