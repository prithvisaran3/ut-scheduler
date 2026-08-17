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

/** Wall-clock minutes since midnight at `timeZone` for an absolute instant. */
function minutesOfDayIn(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(epochMs));
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Some engines render midnight as "24" under hour12:false.
  return (read("hour") % 24) * 60 + read("minute");
}

/** Slot in progress at the clinic. Negative before opening, >= SLOTS_PER_DAY after. */
export function clinicSlotIndex(epochMs: number, timeZone: string): number {
  const minutes = minutesOfDayIn(epochMs, timeZone) - DAY_START_HOUR * 60;
  return Math.floor(minutes / SLOT_MINUTES);
}

/** Calendar date (yyyy-MM-dd) at the clinic for an absolute instant. */
export function clinicDateString(epochMs: number, timeZone: string): string {
  // en-CA formats as yyyy-MM-dd, matching the API's date format.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
}

export function minutesToDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
