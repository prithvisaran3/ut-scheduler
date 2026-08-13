"""Pure scheduling engine — numpy in, plain results out. No DB imports.

Keep algorithm constants aligned with app.core.schedule_config.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.core.schedule_config import MAX_REJECTED_ATTEMPTS, RESOURCE_TYPES, SLOT_MINUTES

# Resource type → row index in the occupancy matrix. Gap is never a row.
RESOURCE_INDEX: dict[str, int] = {name: i for i, name in enumerate(RESOURCE_TYPES)}

# Sentinel in the requirement array: this offset needs no capacity resource.
GAP_SENTINEL: int = -1


@dataclass(frozen=True)
class PathwayStepLike:
    """Minimal step shape accepted by the engine (ORM or plain dicts)."""

    resource_type: str
    duration_minutes: int
    block_count: int
    sequence_order: int = 0


@dataclass(frozen=True)
class RejectedAttempt:
    slot_index: int
    blocking_resource: str
    offset: int


@dataclass(frozen=True)
class FitResult:
    earliest_start_slot: int | None
    end_slot: int | None
    rejected_attempts: list[RejectedAttempt] = field(default_factory=list)
    requirement_length: int = 0


def normalize_steps(steps: Sequence[PathwayStepLike | dict]) -> list[PathwayStepLike]:
    """Coerce dict/ORM-like steps into PathwayStepLike, sorted by sequence."""
    normalized: list[PathwayStepLike] = []
    for step in steps:
        if isinstance(step, PathwayStepLike):
            normalized.append(step)
            continue
        if hasattr(step, "resource_type"):
            rt = step.resource_type
            rt_val = rt.value if hasattr(rt, "value") else str(rt)
            normalized.append(
                PathwayStepLike(
                    resource_type=rt_val,
                    duration_minutes=int(step.duration_minutes),
                    block_count=int(step.block_count),
                    sequence_order=int(getattr(step, "sequence_order", 0)),
                )
            )
            continue
        normalized.append(
            PathwayStepLike(
                resource_type=str(step["resource_type"]),
                duration_minutes=int(step["duration_minutes"]),
                block_count=int(step["block_count"]),
                sequence_order=int(step.get("sequence_order", 0)),
            )
        )
    return sorted(normalized, key=lambda s: s.sequence_order)


def build_requirement_array(steps: Sequence[PathwayStepLike | dict]) -> np.ndarray:
    """Flatten pathway steps into a length-L array of resource indices (or GAP_SENTINEL).

    Each position corresponds to one 30-minute block along the pathway.
    Gap offsets require nothing and always pass capacity checks.
    """
    ordered = normalize_steps(steps)
    parts: list[int] = []
    for step in ordered:
        expected = step.duration_minutes // SLOT_MINUTES
        if step.block_count != expected:
            raise ValueError(
                f"block_count {step.block_count} inconsistent with "
                f"duration_minutes {step.duration_minutes} / SLOT_MINUTES {SLOT_MINUTES}"
            )
        if step.resource_type == "gap":
            parts.extend([GAP_SENTINEL] * step.block_count)
        elif step.resource_type not in RESOURCE_INDEX:
            raise ValueError(f"Unknown resource_type: {step.resource_type}")
        else:
            parts.extend([RESOURCE_INDEX[step.resource_type]] * step.block_count)
    if not parts:
        raise ValueError("Pathway has no blocks")
    return np.asarray(parts, dtype=np.int16)


def _first_blocking_resource(
    used: np.ndarray,
    capacity: np.ndarray,
    requirement: np.ndarray,
    start: int,
) -> tuple[str, int] | None:
    """Return (resource_name, offset) for the first capacity breach at `start`, else None."""
    length = requirement.shape[0]
    for offset, req in enumerate(requirement):
        if req == GAP_SENTINEL:
            continue
        r = int(req)
        if used[r, start + offset] + 1 > capacity[r]:
            return RESOURCE_TYPES[r], offset
    return None


def find_earliest_fit(
    used: np.ndarray,
    capacity: np.ndarray,
    requirement: np.ndarray,
    *,
    max_rejected: int = MAX_REJECTED_ATTEMPTS,
) -> FitResult:
    """Find the earliest start slot where the pathway fits without exceeding capacity.

    Parameters
    ----------
    used:
        Occupancy matrix of shape (num_capacity_resources, T). Integer counts of
        how many patients currently occupy each resource/slot. Admin blocks should
        be represented as `capacity` worth of occupancy (fully unavailable).
    capacity:
        Shape (num_capacity_resources,) — max concurrent patients per resource.
    requirement:
        Length-L array from :func:`build_requirement_array`.

    Uses sliding_window_view for vectorized candidate checks rather than a nested
    Python loop over every slot/resource pair for the pass/fail decision. Rejected
    attempts are recorded as a byproduct while scanning toward the first fit.
    """
    used = np.asarray(used, dtype=np.int16)
    capacity = np.asarray(capacity, dtype=np.int16)
    requirement = np.asarray(requirement, dtype=np.int16)

    if used.ndim != 2:
        raise ValueError("used must be 2-D (resources, slots)")
    num_resources, t = used.shape
    if capacity.shape != (num_resources,):
        raise ValueError("capacity shape must match used rows")
    length = int(requirement.shape[0])
    if length == 0:
        raise ValueError("requirement must be non-empty")
    if length > t:
        return FitResult(None, None, [], length)

    max_start = t - length
    rejected: list[RejectedAttempt] = []

    # Vectorized: for each capacity resource, build a boolean mask of starts where
    # that resource would exceed capacity somewhere in the L-window.
    fail_any = np.zeros(max_start + 1, dtype=bool)
    for r in range(num_resources):
        offsets = np.where(requirement == r)[0]
        if offsets.size == 0:
            continue
        # windows[s, k] = used[r, s+k] for k in 0..L-1
        windows = sliding_window_view(used[r], length)  # shape (max_start+1, L)
        # Check only the offsets this pathway needs for resource r
        needed = windows[:, offsets] + 1
        fail_r = np.any(needed > capacity[r], axis=1)
        fail_any |= fail_r

    for s in range(max_start + 1):
        if not fail_any[s]:
            # Double-check with exact logic (guards float/dtype edge cases)
            blocking = _first_blocking_resource(used, capacity, requirement, s)
            if blocking is None:
                return FitResult(
                    earliest_start_slot=s,
                    end_slot=s + length,
                    rejected_attempts=rejected,
                    requirement_length=length,
                )
            # Extremely rare mismatch — treat as fail and continue
            fail_any[s] = True

        if len(rejected) < max_rejected:
            blocking = _first_blocking_resource(used, capacity, requirement, s)
            if blocking is not None:
                resource_name, offset = blocking
                rejected.append(
                    RejectedAttempt(slot_index=s, blocking_resource=resource_name, offset=offset)
                )

    return FitResult(None, None, rejected, length)


def expand_booking_slots(
    requirement: np.ndarray,
    start_slot: int,
) -> list[tuple[int, str | None]]:
    """Return [(slot_index, resource_type_or_None_for_gap), ...] for a confirmed start."""
    out: list[tuple[int, str | None]] = []
    for offset, req in enumerate(requirement):
        slot = start_slot + offset
        if req == GAP_SENTINEL:
            out.append((slot, None))
        else:
            out.append((slot, RESOURCE_TYPES[int(req)]))
    return out
