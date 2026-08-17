import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";
import type { BookingSlot } from "../../types/booking";

export interface StepWindow {
  resource_type: string;
  start_slot: number;
  end_slot_exclusive: number;
}

/** Merge consecutive same-type booking slots into step windows (DB truth). */
export function buildStepWindows(slots: BookingSlot[]): StepWindow[] {
  if (!slots.length) return [];
  const sorted = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const windows: StepWindow[] = [];
  let start = sorted[0].slot_index;
  let prev = sorted[0].slot_index;
  let type = sorted[0].resource_type;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.resource_type === type && s.slot_index === prev + 1) {
      prev = s.slot_index;
      continue;
    }
    windows.push({ resource_type: type, start_slot: start, end_slot_exclusive: prev + 1 });
    start = s.slot_index;
    prev = s.slot_index;
    type = s.resource_type;
  }
  windows.push({ resource_type: type, start_slot: start, end_slot_exclusive: prev + 1 });
  return windows;
}

function labelForType(type: string): string {
  const key = type as keyof typeof strings.grid;
  return strings.grid[key] ?? type;
}

interface Props {
  slots: BookingSlot[];
}

export function StepBreakdown({ slots }: Props) {
  const windows = buildStepWindows(slots);
  return (
    <ul className="flex flex-col gap-1.5">
      {windows.map((w) => (
        <li
          key={`${w.resource_type}-${w.start_slot}`}
          className="flex items-center justify-between text-[length:var(--text-14)]"
        >
          <span className="font-medium text-[var(--color-navy-900)]">
            {labelForType(w.resource_type)}
          </span>
          <span className="tabular-nums text-[var(--color-grey-700)]">
            {slotIndexToLabel(w.start_slot)} — {slotIndexToLabel(w.end_slot_exclusive)}
          </span>
        </li>
      ))}
    </ul>
  );
}
