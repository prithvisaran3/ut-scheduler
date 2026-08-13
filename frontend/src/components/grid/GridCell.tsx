import type { ResourceSlot } from "../../types/schedule";
import { strings } from "../../content/strings";

interface Props {
  slot: ResourceSlot;
  resourceType: string;
  mode?: "patient" | "admin";
  selected?: boolean;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
}

export function GridCell({
  slot,
  resourceType,
  mode = "admin",
  selected,
  onMouseDown,
  onMouseEnter,
}: Props) {
  const isGap = resourceType === "gap";
  const occupied = slot.occupied > 0;
  const blocked = slot.blocked;
  const showName =
    mode === "admin" && occupied && !isGap && !!slot.occupants[0]?.patient_name;
  const unavailableHint =
    mode === "patient" && !isGap && (occupied || blocked)
      ? strings.grid.unavailable
      : undefined;

  let bg = "transparent";
  if (blocked && !isGap) bg = "var(--color-grey-200)";
  else if (occupied && !isGap) bg = "var(--color-navy-700)";
  else if (occupied && isGap) bg = "var(--color-grey-100)";
  if (selected) bg = "var(--overlay-marquee)";

  return (
    <div
      className="relative box-border border-b border-r border-[var(--color-grey-200)]"
      style={{
        height: "var(--grid-row-height)",
        background: bg,
        cursor: isGap || resourceType === "patient" ? "default" : "crosshair",
      }}
      title={unavailableHint}
      aria-label={unavailableHint}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      {showName ? (
        <span className="absolute inset-x-1 top-1 truncate text-[length:var(--text-10)] text-[var(--color-white)]">
          {slot.occupants[0].patient_name}
        </span>
      ) : null}
    </div>
  );
}
