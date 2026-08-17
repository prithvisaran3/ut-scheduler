"""Scheduling constants — keep in sync with frontend/src/lib/scheduleConfig.ts.

Ground truth: client spreadsheet (15-minute slots, 08:00–17:00).
The sheet's 17:00 row is the closing boundary, not a bookable slot → 36 slots.
"""

from __future__ import annotations

DAY_START_HOUR: int = 8
DAY_END_HOUR: int = 17
SLOT_MINUTES: int = 15

# Clinic wall-clock timezone. Slot indices are offsets from DAY_START_HOUR in
# THIS zone, never in the server's local zone (Render runs UTC).
# Override per deployment with the CLINIC_TIMEZONE env var.
DEFAULT_CLINIC_TIMEZONE: str = "America/New_York"  # Bethesda, MD
SLOTS_PER_DAY: int = ((DAY_END_HOUR - DAY_START_HOUR) * 60) // SLOT_MINUTES  # 36

# Capacity-bearing resources only. GAP is uptake wait — not a capacity row.
RESOURCE_TYPES: list[str] = ["doctor", "nmt", "scan"]

# Admin grid matches the spreadsheet: Doctor | NMT | Patient | Scan.
ADMIN_DISPLAY_COLUMNS: list[str] = ["doctor", "nmt", "patient", "scan"]
# Patient grid: Doctor | NMT | GAP | Scan — no Patient column (privacy).
PATIENT_DISPLAY_COLUMNS: list[str] = ["doctor", "nmt", "gap", "scan"]

# Pathway step types include gap (non-capacity, stored on booking slots).
STEP_TYPES: list[str] = ["doctor", "nmt", "gap", "scan"]

DEFAULT_CAPACITY: int = 1

# Usable day length in minutes (for builder warnings).
DAY_MINUTES: int = (DAY_END_HOUR - DAY_START_HOUR) * 60

# Pathway 1 ground truth — spreadsheet Sheet4 (15-min slots).
# Doctor 45 | NMT 30 | GAP 60 | Scan 60 | Doctor 30 → 15 blocks / 225 min.
PATHWAY_1_STEPS: list[dict] = [
    {"resource_type": "doctor", "duration_minutes": 45, "block_count": 3, "sequence_order": 0},
    {"resource_type": "nmt", "duration_minutes": 30, "block_count": 2, "sequence_order": 1},
    {"resource_type": "gap", "duration_minutes": 60, "block_count": 4, "sequence_order": 2},
    {"resource_type": "scan", "duration_minutes": 60, "block_count": 4, "sequence_order": 3},
    {"resource_type": "doctor", "duration_minutes": 30, "block_count": 2, "sequence_order": 4},
]

PATHWAY_1_TOTAL_BLOCKS: int = 15
PATHWAY_1_TOTAL_MINUTES: int = 225  # 3h 45m

# Slot index for 10:00 with DAY_START_HOUR=8 and SLOT_MINUTES=15.
PATHWAY_1_SHEET4_START_SLOT: int = 8  # 10:00

MAX_REJECTED_ATTEMPTS: int = 3
