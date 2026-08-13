/** Keep in sync with backend/app/core/schedule_config.py */

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES; // 24

/** Capacity-bearing resources only — GAP is excluded. */
export const RESOURCE_TYPES = ["doctor", "nmt", "scan"] as const;
export type CapacityResourceType = (typeof RESOURCE_TYPES)[number];

export const STEP_TYPES = ["doctor", "nmt", "gap", "scan"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const DEFAULT_CAPACITY = 1;
