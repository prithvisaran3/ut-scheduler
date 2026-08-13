"""Unit tests for the pure scheduling engine — no DB, no FastAPI."""

from __future__ import annotations

import numpy as np
import pytest

from app.core.schedule_config import PATHWAY_1_STEPS, RESOURCE_TYPES, SLOTS_PER_DAY
from app.services.scheduling_engine import (
    GAP_SENTINEL,
    build_requirement_array,
    find_earliest_fit,
)


def _empty_day(capacity: int = 1) -> tuple[np.ndarray, np.ndarray]:
    used = np.zeros((len(RESOURCE_TYPES), SLOTS_PER_DAY), dtype=np.int16)
    cap = np.full(len(RESOURCE_TYPES), capacity, dtype=np.int16)
    return used, cap


def test_pathway_1_requirement_shape() -> None:
    req = build_requirement_array(PATHWAY_1_STEPS)
    assert req.shape == (9,)
    # Doctor×3, NMT×1, Gap×2, Scan×2, Doctor×1
    assert list(req) == [0, 0, 0, 1, GAP_SENTINEL, GAP_SENTINEL, 2, 2, 0]


def test_exact_fit_at_slot_zero() -> None:
    used, cap = _empty_day()
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0
    assert result.end_slot == 9
    assert result.rejected_attempts == []


def test_no_fit_in_day() -> None:
    used, cap = _empty_day()
    # Block doctor for the entire day
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
    assert result.end_slot == 13
    assert len(result.rejected_attempts) == 3
    assert result.rejected_attempts[0].slot_index == 0
    assert result.rejected_attempts[0].blocking_resource == "doctor"


def test_capacity_greater_than_one_allows_overlap() -> None:
    used, cap = _empty_day(capacity=2)
    # One patient already occupying doctor everywhere — still room for one more
    used[0, :] = 1
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0
    assert result.rejected_attempts == []


def test_capacity_one_blocks_overlap() -> None:
    used, cap = _empty_day(capacity=1)
    used[0, 2] = 1  # doctor slot 2 busy → starts 0/1/2 fail; earliest is 3
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 3


def test_gap_never_blocks() -> None:
    used, cap = _empty_day()
    # Even if we somehow mark "used" high on all rows at gap offsets of start=0
    # (slots 4-5), gaps are not checked — fill nmt/scan/doctor free at 0.
    req = build_requirement_array(PATHWAY_1_STEPS)
    result = find_earliest_fit(used, cap, req)
    assert result.earliest_start_slot == 0


def test_inconsistent_block_count_raises() -> None:
    with pytest.raises(ValueError, match="inconsistent"):
        build_requirement_array(
            [{"resource_type": "doctor", "duration_minutes": 90, "block_count": 2, "sequence_order": 0}]
        )


def test_feasible_starts_lists_every_valid_window() -> None:
    """A short pathway that fits in exactly 3 places must return those 3 starts."""
    used, cap = _empty_day()
    # Doctor busy everywhere except slots 2, 5, and 10 (single-slot pathway).
    used[0, :] = 1
    used[0, 2] = 0
    used[0, 5] = 0
    used[0, 10] = 0
    req = build_requirement_array(
        [{"resource_type": "doctor", "duration_minutes": 30, "block_count": 1, "sequence_order": 0}]
    )
    result = find_earliest_fit(used, cap, req)
    assert result.feasible_starts == [2, 5, 10]
    assert result.earliest_start_slot == 2
    assert result.end_slot == 3
