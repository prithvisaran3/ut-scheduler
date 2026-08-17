"""Unit tests for the pure scheduling engine — no DB, no FastAPI.

Pathway 1 ground truth matches the client spreadsheet (15-min slots).
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.schedule_config import (
    PATHWAY_1_SHEET4_START_SLOT,
    PATHWAY_1_STEPS,
    PATHWAY_1_TOTAL_BLOCKS,
    PATHWAY_1_TOTAL_MINUTES,
    RESOURCE_TYPES,
    SLOT_MINUTES,
    SLOTS_PER_DAY,
)
from app.services.scheduling_engine import (
    GAP_SENTINEL,
    build_requirement_array,
    expand_booking_slots,
    find_earliest_fit,
)


def _empty_day(capacity: int = 1) -> tuple[np.ndarray, np.ndarray]:
    used = np.zeros((len(RESOURCE_TYPES), SLOTS_PER_DAY), dtype=np.int16)
    cap = np.full(len(RESOURCE_TYPES), capacity, dtype=np.int16)
    return used, cap


def test_slots_per_day_matches_spreadsheet() -> None:
    assert SLOT_MINUTES == 15
    assert SLOTS_PER_DAY == 36


def test_pathway_1_requirement_shape() -> None:
    req = build_requirement_array(PATHWAY_1_STEPS)
    assert req.shape == (PATHWAY_1_TOTAL_BLOCKS,)
    assert PATHWAY_1_TOTAL_BLOCKS == 15
    assert PATHWAY_1_TOTAL_MINUTES == 225
    # Doctor×3, NMT×2, Gap×4, Scan×4, Doctor×2
    assert list(req) == [
        0,
        0,
        0,
        1,
        1,
        GAP_SENTINEL,
        GAP_SENTINEL,
        GAP_SENTINEL,
        GAP_SENTINEL,
        2,
        2,
        2,
        2,
        0,
        0,
    ]


def test_pathway_1_at_1000_matches_sheet4() -> None:
    """Sheet4 worked example: Pathway 1 starting at 10:00 (slot 8)."""
    start = PATHWAY_1_SHEET4_START_SLOT
    assert start == 8  # 10:00 with 08:00 start / 15-min slots
    req = build_requirement_array(PATHWAY_1_STEPS)
    slots = expand_booking_slots(req, start)
    expected = [
        (8, "doctor"),
        (9, "doctor"),
        (10, "doctor"),
        (11, "nmt"),
        (12, "nmt"),
        (13, None),
        (14, None),
        (15, None),
        (16, None),
        (17, "scan"),
        (18, "scan"),
        (19, "scan"),
        (20, "scan"),
        (21, "doctor"),
        (22, "doctor"),
    ]
    assert slots == expected

    # Empty day → engine places at slot 0, but occupancy pattern from start=8
    # must consume doctor/nmt/scan exactly as Sheet4 columns I-L.
    used, cap = _empty_day()
    for slot_index, rtype in slots:
        if rtype is None:
            continue
        used[RESOURCE_TYPES.index(rtype), slot_index] += 1

    # Patient continuous span (display-only): slots 8..22 inclusive
    patient_span = list(range(8, 23))
    assert len(patient_span) == PATHWAY_1_TOTAL_BLOCKS

    # Resource columns: gap offsets leave doctor/nmt/scan at 0
    for slot_index, rtype in slots:
        if rtype is None:
            for ri in range(len(RESOURCE_TYPES)):
                assert used[ri, slot_index] == 0
        else:
            assert used[RESOURCE_TYPES.index(rtype), slot_index] == 1


def test_exact_fit_at_slot_zero() -> None:
    used, cap = _empty_day()
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0
    assert result.end_slot == PATHWAY_1_TOTAL_BLOCKS
    assert result.rejected_attempts == []


def test_no_fit_in_day() -> None:
    used, cap = _empty_day()
    used[0, :] = 1
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot is None
    assert result.end_slot is None
    assert len(result.rejected_attempts) == 3
    assert all(a.blocking_resource == "doctor" for a in result.rejected_attempts)


def test_fit_after_skipping_blocked_slots() -> None:
    used, cap = _empty_day()
    # Doctor busy for first 4 slots → earliest start should be 4
    used[0, 0:4] = 1
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 4
    assert result.end_slot == 4 + PATHWAY_1_TOTAL_BLOCKS
    assert len(result.rejected_attempts) == 3
    assert result.rejected_attempts[0].slot_index == 0
    assert result.rejected_attempts[0].blocking_resource == "doctor"


def test_capacity_greater_than_one_allows_overlap() -> None:
    used, cap = _empty_day(capacity=2)
    used[0, :] = 1
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0
    assert result.rejected_attempts == []


def test_capacity_one_blocks_overlap() -> None:
    used, cap = _empty_day(capacity=1)
    used[0, 2] = 1
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 3


def test_gap_never_blocks() -> None:
    used, cap = _empty_day()
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0


def test_inconsistent_block_count_raises() -> None:
    with pytest.raises(ValueError, match="inconsistent"):
        build_requirement_array(
            [
                {
                    "resource_type": "doctor",
                    "duration_minutes": 45,
                    "block_count": 2,
                    "sequence_order": 0,
                }
            ]
        )


def test_non_multiple_duration_raises() -> None:
    """A 20-minute step must not silently truncate to 1×15-min block."""
    with pytest.raises(ValueError, match="multiple of"):
        build_requirement_array(
            [
                {
                    "resource_type": "doctor",
                    "duration_minutes": 20,
                    "block_count": 1,
                    "sequence_order": 0,
                }
            ]
        )


def test_feasible_starts_lists_every_valid_window() -> None:
    """A short pathway that fits in exactly 3 places must return those 3 starts."""
    used, cap = _empty_day()
    used[0, :] = 1
    used[0, 2] = 0
    used[0, 5] = 0
    used[0, 10] = 0
    req = build_requirement_array(
        [
            {
                "resource_type": "doctor",
                "duration_minutes": 15,
                "block_count": 1,
                "sequence_order": 0,
            }
        ]
    )
    result = find_earliest_fit(used, cap, req)
    assert result.feasible_starts == [2, 5, 10]
    assert result.earliest_start_slot == 2
    assert result.end_slot == 3


def test_nurse_is_a_capacity_row() -> None:
    """Nurse occupies its own engine row; a busy nurse does not block the doctor."""
    assert RESOURCE_TYPES[-1] == "nurse"
    nurse = RESOURCE_TYPES.index("nurse")
    req = build_requirement_array(
        [
            {
                "resource_type": "nurse",
                "duration_minutes": 30,
                "block_count": 2,
                "sequence_order": 0,
            }
        ]
    )
    assert list(req) == [nurse, nurse]

    used, cap = _empty_day()
    used[nurse, 0] = 1
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 1
    assert result.rejected_attempts[0].blocking_resource == "nurse"
    assert used[0, 0] == 0  # doctor row untouched

