"""Scheduling constants — keep in sync with frontend/src/lib/scheduleConfig.ts."""

from __future__ import annotations

DAY_START_HOUR: int = 8
DAY_END_HOUR: int = 20
SLOT_MINUTES: int = 30
SLOTS_PER_DAY: int = ((DAY_END_HOUR - DAY_START_HOUR) * 60) // SLOT_MINUTES  # 24

# Capacity-bearing resources only. GAP is wait/uptake time, not a resource.
RESOURCE_TYPES: list[str] = ["doctor", "nmt", "scan"]

# Pathway step types include gap (non-capacity).
STEP_TYPES: list[str] = ["doctor", "nmt", "gap", "scan"]

DEFAULT_CAPACITY: int = 1

# Pathway 1 ground truth (United Theranostics interview example).
# Design-file compositions are visual artifacts — this is authoritative.
PATHWAY_1_STEPS: list[dict] = [
    {"resource_type": "doctor", "duration_minutes": 90, "block_count": 3, "sequence_order": 0},
    {"resource_type": "nmt", "duration_minutes": 30, "block_count": 1, "sequence_order": 1},
    {"resource_type": "gap", "duration_minutes": 60, "block_count": 2, "sequence_order": 2},
    {"resource_type": "scan", "duration_minutes": 60, "block_count": 2, "sequence_order": 3},
    {"resource_type": "doctor", "duration_minutes": 30, "block_count": 1, "sequence_order": 4},
]

PATHWAY_1_TOTAL_BLOCKS: int = 9
PATHWAY_1_TOTAL_MINUTES: int = 270  # 4h 30m

MAX_REJECTED_ATTEMPTS: int = 3
