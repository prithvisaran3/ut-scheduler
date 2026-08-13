from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.pathway import PathwayCreate, PathwayOut, PathwayUpdate
from app.services import pathway_service

router = APIRouter(prefix="/pathways", tags=["pathways"])


@router.get("", response_model=list[PathwayOut])
def list_pathways(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[PathwayOut]:
    return pathway_service.list_pathways(db)


@router.post("", response_model=PathwayOut, status_code=status.HTTP_201_CREATED)
def create_pathway(
    body: PathwayCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
) -> PathwayOut:
    try:
        return pathway_service.create_pathway(db, body, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{pathway_id}", response_model=PathwayOut)
def update_pathway(
    pathway_id: UUID,
    body: PathwayUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin")),
) -> PathwayOut:
    try:
        return pathway_service.update_pathway(db, pathway_id, body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{pathway_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pathway(
    pathway_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin")),
) -> None:
    try:
        pathway_service.delete_pathway(db, pathway_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
