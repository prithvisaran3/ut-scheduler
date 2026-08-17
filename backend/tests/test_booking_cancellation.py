"""Who may cancel what, and when.

Cancelling is the one patient-facing write that destroys clinical intent, so the
rules are asserted directly rather than inferred from the endpoint: ownership,
the clinic's wall clock (never the server's), idempotency, and an audit trail.

The session is stubbed — `cancel_booking` only ever reads one row, appends an
audit entry and commits, so a real database adds nothing but a skip.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from freezegun import freeze_time

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.services.booking_service import BookingAlreadyStartedError, cancel_booking

EASTERN = ZoneInfo("America/New_York")
MONDAY = date(2026, 8, 17)


@pytest.fixture(autouse=True)
def _pin_clinic_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "clinic_timezone", "America/New_York")


class FakeSession:
    """Just enough Session for cancel_booking: one row in, writes recorded."""

    def __init__(self, booking: Booking | None) -> None:
        self._booking = booking
        self.added: list[Any] = []
        self.commits = 0

    def scalar(self, _stmt: Any) -> Booking | None:
        return self._booking

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def commit(self) -> None:
        self.commits += 1

    @property
    def audit_entries(self) -> list[AuditLog]:
        return [row for row in self.added if isinstance(row, AuditLog)]


def _user(role: UserRole) -> User:
    return User(
        id=uuid4(),
        email=f"{role.value}-{uuid4().hex[:6]}@test.com",
        password_hash="x",
        role=role,
        full_name=role.value.title(),
    )


def _booking(
    patient_id: Any,
    *,
    day: date = MONDAY,
    start_slot: int = 16,  # 12:00 clinic time
    status: BookingStatus = BookingStatus.confirmed,
) -> Booking:
    return Booking(
        id=uuid4(),
        patient_id=patient_id,
        pathway_id=uuid4(),
        date=day,
        start_slot=start_slot,
        status=status,
    )


# --- ownership --------------------------------------------------------------


@freeze_time("2026-08-17 13:00:00")  # 09:00 EDT, well before the appointment
def test_patient_can_cancel_their_own_booking() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled
    assert db.commits == 1


@freeze_time("2026-08-17 13:00:00")
def test_patient_cannot_cancel_someone_elses_booking() -> None:
    intruder = _user(UserRole.patient)
    booking = _booking(uuid4())
    db = FakeSession(booking)

    with pytest.raises(PermissionError):
        cancel_booking(db, booking.id, intruder)

    assert booking.status == BookingStatus.confirmed
    assert db.commits == 0


@freeze_time("2026-08-17 13:00:00")
def test_admin_can_cancel_a_patients_booking() -> None:
    booking = _booking(uuid4())
    db = FakeSession(booking)

    cancel_booking(db, booking.id, _user(UserRole.admin))

    assert booking.status == BookingStatus.cancelled


def test_missing_booking_raises_lookup_error() -> None:
    db = FakeSession(None)
    with pytest.raises(LookupError):
        cancel_booking(db, uuid4(), _user(UserRole.patient))


# --- the clinic clock -------------------------------------------------------
#
# Server time is UTC in production. 16:00 UTC is 12:00 in Bethesda, so a
# booking at slot 16 is starting exactly now — not four hours in the past.


@freeze_time("2026-08-17 15:59:00")  # 11:59 EDT, one minute to go
def test_booking_is_cancellable_right_up_to_its_start() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled


@freeze_time("2026-08-17 16:00:00")  # 12:00 EDT, exactly on the start
def test_booking_starting_exactly_now_is_still_cancellable() -> None:
    """Symmetric with booking: the slot is offered right up to 12:00:00 sharp,
    so it can be given back at 12:00:00 sharp too."""
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled


@freeze_time("2026-08-17 16:01:00")  # 12:01 EDT, one minute in
def test_booking_already_underway_is_not_cancellable() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    with pytest.raises(BookingAlreadyStartedError, match="already started"):
        cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.confirmed
    assert db.commits == 0


@freeze_time("2026-08-17 16:00:00")
def test_yesterdays_booking_is_not_cancellable() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id, day=MONDAY - timedelta(days=1), start_slot=0)
    db = FakeSession(booking)

    with pytest.raises(BookingAlreadyStartedError):
        cancel_booking(db, booking.id, patient)


@freeze_time("2026-08-17 16:00:00")
def test_tomorrows_booking_is_cancellable() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id, day=MONDAY + timedelta(days=1), start_slot=0)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled


@freeze_time("2026-08-17 16:00:00")
def test_utc_server_clock_does_not_lock_a_patient_out_of_the_afternoon() -> None:
    """The regression this rule could easily reintroduce.

    A naive `datetime.now()` reads 16:00 and would call a 15:00 appointment past.
    """
    assert datetime.now().hour == 16  # the trap
    patient = _user(UserRole.patient)
    booking = _booking(patient.id, start_slot=28)  # 15:00 clinic time
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled


@freeze_time("2026-08-17 16:01:00")
def test_admin_may_still_correct_a_booking_that_has_started() -> None:
    """Staff are the fallback the patient-facing error message points to."""
    booking = _booking(uuid4())
    db = FakeSession(booking)

    cancel_booking(db, booking.id, _user(UserRole.admin))

    assert booking.status == BookingStatus.cancelled


# --- idempotency ------------------------------------------------------------


@freeze_time("2026-08-17 13:00:00")
def test_cancelling_an_already_cancelled_booking_is_a_no_op() -> None:
    """Two tabs, two clicks — the second must not error or double-audit."""
    patient = _user(UserRole.patient)
    booking = _booking(patient.id, status=BookingStatus.cancelled)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    assert booking.status == BookingStatus.cancelled
    assert db.commits == 0
    assert db.audit_entries == []


@freeze_time("2026-08-17 13:00:00")
def test_ownership_is_checked_before_status() -> None:
    """A cancelled booking must not become a way to probe other patients' ids."""
    db = FakeSession(_booking(uuid4(), status=BookingStatus.cancelled))
    with pytest.raises(PermissionError):
        cancel_booking(db, uuid4(), _user(UserRole.patient))


# --- audit trail ------------------------------------------------------------


@freeze_time("2026-08-17 13:00:00")
def test_cancellation_is_audited() -> None:
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    cancel_booking(db, booking.id, patient)

    entry = db.audit_entries[0]
    assert entry.actor_id == patient.id
    assert entry.action == "booking.cancelled"
    assert entry.entity == "booking"
    assert entry.entity_id == str(booking.id)

    detail = json.loads(entry.detail)
    assert detail["patient_id"] == str(booking.patient_id)
    assert detail["date"] == "2026-08-17"
    assert detail["start_slot"] == 16
    assert detail["cancelled_by_role"] == "patient"
    # Recorded in clinic time, so the trail reads the way the clinic experienced it.
    assert detail["clinic_time"].startswith("2026-08-17T09:00:00-04:00")


@freeze_time("2026-08-17 13:00:00")
def test_audit_records_who_cancelled_when_it_was_an_admin() -> None:
    admin = _user(UserRole.admin)
    booking = _booking(uuid4())
    db = FakeSession(booking)

    cancel_booking(db, booking.id, admin)

    detail = json.loads(db.audit_entries[0].detail)
    assert db.audit_entries[0].actor_id == admin.id
    assert detail["cancelled_by_role"] == "admin"
    assert detail["patient_id"] == str(booking.patient_id)


def test_explicit_now_overrides_the_clock() -> None:
    """The `now` seam the API never uses but tests and backfills depend on."""
    patient = _user(UserRole.patient)
    booking = _booking(patient.id)
    db = FakeSession(booking)

    with pytest.raises(BookingAlreadyStartedError):
        cancel_booking(
            db, booking.id, patient, now=datetime(2026, 8, 17, 12, 30, tzinfo=EASTERN)
        )
