"""Clinic wall-clock time.

Every scheduling decision is made in the clinic's timezone, never the server's.
Render (and most PaaS hosts) run UTC, so a naive `datetime.now()` reads four or
five hours ahead of Bethesda and silently marks the rest of the day as past.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.schedule_config import DAY_START_HOUR, SLOT_MINUTES


def clinic_tz() -> ZoneInfo:
    return ZoneInfo(settings.clinic_timezone)


def clinic_now() -> datetime:
    """Timezone-aware current time at the clinic."""
    return datetime.now(clinic_tz())


def clinic_today() -> date:
    """Calendar date at the clinic, which can differ from the server's date."""
    return clinic_now().date()


def slot_start(day: date, slot_index: int) -> datetime:
    """Aware datetime at which `slot_index` begins on `day`.

    Wall-clock arithmetic on purpose: the grid is anchored to DAY_START_HOUR
    local time on both sides of a DST change.
    """
    midnight = datetime.combine(day, datetime.min.time(), tzinfo=clinic_tz())
    return midnight + timedelta(minutes=DAY_START_HOUR * 60 + slot_index * SLOT_MINUTES)


def current_slot_index(now: datetime | None = None) -> int:
    """Index of the slot in progress. Negative before opening, >= SLOTS_PER_DAY after.

    Display only (the now-line). Bookability is decided by comparing actual slot
    start times, not by comparing indices.
    """
    moment = now.astimezone(clinic_tz()) if now is not None else clinic_now()
    minutes_since_open = (moment.hour * 60 + moment.minute) - DAY_START_HOUR * 60
    return minutes_since_open // SLOT_MINUTES
