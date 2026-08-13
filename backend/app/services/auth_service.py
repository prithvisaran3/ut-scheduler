"""Authentication service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole


class EmailTakenError(Exception):
    """Raised when signup email already exists."""


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def signup_patient(db: Session, *, full_name: str, email: str, password: str) -> User:
    """Create a patient account. Admins cannot be created through this path."""
    normalized = email.lower().strip()
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        raise EmailTakenError("Email already registered")

    user = User(
        email=normalized,
        password_hash=hash_password(password),
        role=UserRole.patient,
        full_name=full_name.strip(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailTakenError("Email already registered") from exc
    db.refresh(user)
    return user


def issue_token(user: User) -> dict:
    token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
        full_name=user.full_name,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name,
    }
