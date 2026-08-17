"""Scheduling must follow the clinic's wall clock, not the server's.

Render runs UTC. Before the fix, `datetime.now()` read 16:28 while Bethesda was
at 12:28, so every remaining start slot was filtered out as "past" and patients
saw "No availability today" on an empty day. These tests freeze time in UTC —
exactly the deployed environment — and assert the clinic's view wins.

No DB: the temporal filter is pure, so it is exercised directly.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from freezegun import freeze_time

from app.core.clock import clinic_now, clinic_today, current_slot_index, slot_start
from app.core.config import Settings, settings
from app.core.schedule_config import SLOTS_PER_DAY
from app.services.booking_service import _apply_temporal_filters, _has_started
from app.services.scheduling_engine import FitResult

EASTERN = ZoneInfo("America/New_York")

# Monday. Chosen so weekday/weekend behaviour is not accidentally under test.
MONDAY = date(2026, 8, 17)
SATURDAY = date(2026, 8, 22)

PATHWAY_BLOCKS = 7  # Pathway 3 on the deployed clinic — 105 minutes
MAX_START = SLOTS_PER_DAY - PATHWAY_BLOCKS  # 29 → 15:15


@pytest.fixture(autouse=True)
def _pin_clinic_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ignore any CLINIC_TIMEZONE in the developer's .env."""
    monkeypatch.setattr(settings, "clinic_timezone", "America/New_York")


def _empty_day_fit(length: int = PATHWAY_BLOCKS) -> FitResult:
    """What the engine returns for this pathway on a completely empty day."""
    starts = list(range(SLOTS_PER_DAY - length + 1))
    return FitResult(
        earliest_start_slot=starts[0],
        end_slot=starts[0] + length,
        rejected_attempts=[],
        requirement_length=length,
        feasible_starts=starts,
    )


# --- the reported bug -------------------------------------------------------


@freeze_time("2026-08-17 16:28:00")
def test_utc_server_clock_does_not_hide_the_rest_of_the_clinic_day() -> None:
    """16:28 UTC is 12:28 in Bethesda — the afternoon is still bookable."""
    # The trap: the server's naive clock is nearly at closing time.
    assert datetime.now().hour == 16
    assert clinic_now().hour == 12
    assert clinic_now().minute == 28

    result = _apply_temporal_filters(MONDAY, _empty_day_fit())

    assert result.feasible_starts, "an empty weekday afternoon must offer starts"
    assert result.earliest_start_slot == 18
    assert slot_start(MONDAY, 18) == datetime(2026, 8, 17, 12, 30, tzinfo=EASTERN)
    assert result.end_slot == 18 + PATHWAY_BLOCKS
    # Everything from 12:30 to the last window that still fits before closing.
    assert result.feasible_starts == list(range(18, MAX_START + 1))


@freeze_time("2026-08-18 03:30:00")
def test_clinic_date_can_differ_from_server_date() -> None:
    """23:30 Sunday in Bethesda is already Monday in UTC."""
    assert date.today() == date(2026, 8, 18)
    assert clinic_today() == date(2026, 8, 17)


# --- Fix 2: slot boundary behaviour -----------------------------------------


@freeze_time("2026-08-17 16:00:00")  # 12:00:00 EDT, exactly on a boundary
def test_slot_starting_exactly_now_is_still_bookable() -> None:
    assert slot_start(MONDAY, 16) == clinic_now()
    result = _apply_temporal_filters(MONDAY, _empty_day_fit())
    assert result.earliest_start_slot == 16


@freeze_time("2026-08-17 16:01:00")  # 12:01:00 EDT, one minute past
def test_slot_that_already_began_is_dropped() -> None:
    result = _apply_temporal_filters(MONDAY, _empty_day_fit())
    assert result.earliest_start_slot == 17
    assert slot_start(MONDAY, 17) == datetime(2026, 8, 17, 12, 15, tzinfo=EASTERN)


@freeze_time("2026-08-17 10:30:00")  # 06:30 EDT, before the clinic opens
def test_whole_day_is_bookable_before_opening() -> None:
    result = _apply_temporal_filters(MONDAY, _empty_day_fit())
    assert result.earliest_start_slot == 0
    assert result.feasible_starts == list(range(MAX_START + 1))


@freeze_time("2026-08-17 22:00:00")  # 18:00 EDT, after the clinic closes
def test_nothing_is_bookable_after_closing() -> None:
    result = _apply_temporal_filters(MONDAY, _empty_day_fit())
    assert result.earliest_start_slot is None
    assert result.feasible_starts == []


@freeze_time("2026-08-17 19:15:00")  # 15:15 EDT — the last window starts now
def test_last_window_of_the_day_is_offered_until_it_begins() -> None:
    result = _apply_temporal_filters(MONDAY, _empty_day_fit())
    assert result.feasible_starts == [MAX_START]
    assert result.end_slot == SLOTS_PER_DAY


# --- dates other than today -------------------------------------------------


@freeze_time("2026-08-17 16:28:00")
def test_future_day_offers_every_start() -> None:
    result = _apply_temporal_filters(MONDAY + timedelta(days=1), _empty_day_fit())
    assert result.feasible_starts == list(range(MAX_START + 1))


@freeze_time("2026-08-17 16:28:00")
def test_past_day_offers_nothing() -> None:
    result = _apply_temporal_filters(MONDAY - timedelta(days=3), _empty_day_fit())
    assert result.earliest_start_slot is None
    assert result.feasible_starts == []


@freeze_time("2026-08-17 16:28:00")
def test_weekend_offers_nothing() -> None:
    result = _apply_temporal_filters(SATURDAY, _empty_day_fit())
    assert result.earliest_start_slot is None
    assert result.feasible_starts == []


# --- daylight saving --------------------------------------------------------


def test_slot_times_follow_daylight_saving() -> None:
    """08:00 clinic time on both sides of the DST change — offset differs, hour does not."""
    summer = slot_start(date(2026, 8, 17), 0)
    winter = slot_start(date(2026, 1, 15), 0)
    assert summer.hour == winter.hour == 8
    assert summer.utcoffset() == timedelta(hours=-4)  # EDT
    assert winter.utcoffset() == timedelta(hours=-5)  # EST


@freeze_time("2026-01-15 17:00:00")  # 12:00 EST
def test_winter_afternoon_is_bookable_under_utc_server() -> None:
    thursday = date(2026, 1, 15)
    result = _apply_temporal_filters(thursday, _empty_day_fit())
    assert result.earliest_start_slot == 16


# --- guards -----------------------------------------------------------------


def test_naive_now_is_rejected() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        _has_started(MONDAY, 0, datetime(2026, 8, 17, 12, 0))


def test_unknown_clinic_timezone_fails_at_startup() -> None:
    with pytest.raises(ValueError, match="not a valid IANA timezone"):
        Settings(clinic_timezone="America/Bethesda")


@freeze_time("2026-08-17 16:28:00")
def test_current_slot_index_tracks_clinic_time() -> None:
    assert current_slot_index() == 17  # 12:28 falls inside the 12:15 slot
    assert current_slot_index(datetime(2026, 8, 17, 8, 0, tzinfo=EASTERN)) == 0
    assert current_slot_index(datetime(2026, 8, 17, 7, 59, tzinfo=EASTERN)) == -1
    assert current_slot_index(datetime(2026, 8, 17, 17, 0, tzinfo=EASTERN)) == SLOTS_PER_DAY
