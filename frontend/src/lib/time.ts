import { DAY_START_HOUR, SLOT_MINUTES, SLOTS_PER_DAY } from "./scheduleConfig";

export function slotIndexToLabel(index: number): string {
  const totalMinutes = DAY_START_HOUR * 60 + index * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function labelToSlotIndex(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return ((h - DAY_START_HOUR) * 60 + m) / SLOT_MINUTES;
}

export function slotRangeLabel(start: number, endExclusive: number): string {
  return `${slotIndexToLabel(start)} to ${slotIndexToLabel(endExclusive)}`;
}

export function allSlotLabels(): string[] {
  return Array.from({ length: SLOTS_PER_DAY }, (_, i) => slotIndexToLabel(i));
}

export function minutesToDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
