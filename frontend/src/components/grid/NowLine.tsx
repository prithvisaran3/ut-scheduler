import { GRID_ROW_HEIGHT_PX, SLOTS_PER_DAY } from "../../lib/scheduleConfig";

interface Props {
  slotIndex: number;
}

/** Salmon current-time line across the resource columns. Hidden outside the day window. */
export function NowLine({ slotIndex }: Props) {
  if (slotIndex < 0 || slotIndex >= SLOTS_PER_DAY) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10"
      style={{ top: slotIndex * GRID_ROW_HEIGHT_PX }}
      aria-hidden
    >
      <div className="relative h-px bg-[var(--color-salmon-500)]">
        <div className="absolute -left-1 -top-[4px] h-[9px] w-[9px] rounded-[var(--radius-pill)] bg-[var(--color-salmon-500)] shadow-[var(--shadow-glow-salmon)]" />
      </div>
    </div>
  );
}
