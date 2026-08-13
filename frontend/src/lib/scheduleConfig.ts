/** Keep in sync with backend/app/core/schedule_config.py
 *
 * Ground truth: client spreadsheet — 15-minute slots, 08:00–17:00 (36 bookable
 * slots). The sheet's 17:00 row is the day boundary, not a bookable slot.
 */

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 17;
export const SLOT_MINUTES = 15;
export const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES; // 36

/** Capacity-bearing resources only — GAP is excluded from the engine. */
export const RESOURCE_TYPES = ["doctor", "nmt", "scan"] as const;
export type CapacityResourceType = (typeof RESOURCE_TYPES)[number];

/** Spreadsheet grid order: Doctor | NMT | Patient | Scan (no Gap column). */
export const DISPLAY_COLUMNS = ["doctor", "nmt", "patient", "scan"] as const;

export const STEP_TYPES = ["doctor", "nmt", "gap", "scan"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const DEFAULT_CAPACITY = 1;

/** Must match --grid-row-height in tokens.css */
export const GRID_ROW_HEIGHT_PX = 24;

export const PATHWAY_1_TOTAL_BLOCKS = 15;
export const PATHWAY_1_TOTAL_MINUTES = 225;
