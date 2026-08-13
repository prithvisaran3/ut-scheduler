from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.schedule import ScheduleDayOut, SlotPatchRequest
from app.services import schedule_service

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.get("", response_model=ScheduleDayOut)
def get_schedule(
    date_str: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ScheduleDayOut:
    return schedule_service.build_day_matrix(db, date_str, user)


@router.patch("/slots")
def patch_slots(
    body: SlotPatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
) -> dict:
    try:
        changed = schedule_service.toggle_slots(
            db,
            day=body.date,
            resource_type=body.resource_type,
            slot_indices=body.slot_indices,
            blocked=body.blocked,
            actor_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"changed": changed}
