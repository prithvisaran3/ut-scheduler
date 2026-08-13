import type { ResourceSlot } from "../../types/schedule";
import { strings } from "../../content/strings";
import { SLOT_MINUTES } from "../../lib/scheduleConfig";

interface Props {
  slot: ResourceSlot;
  resourceType: string;
  mode?: "patient" | "admin";
  /** Show patient name — only the first row of a contiguous booking run. */
  showName?: boolean;
  selected?: boolean;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  /** Patient: notify when clicking an occupied/blocked capacity cell. */
  onReservedClick?: () => void;
}

const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

export function GridCell({
  slot,
  resourceType,
  mode = "admin",
  showName = false,
  selected,
  onMouseDown,
  onMouseEnter,
  onReservedClick,
}: Props) {
  const isPatientCol = resourceType === "patient";
  const isGapCol = resourceType === "gap";
  const softCol = isPatientCol || isGapCol;
  const occupied = slot.occupied > 0;
  const blocked = slot.blocked && !softCol;
  const isUptake = softCol && !!slot.is_uptake && occupied;
  const reserved =
    mode === "patient" && !softCol && (occupied || blocked);

  const hourBoundary = slot.slot_index % SLOTS_PER_HOUR === 0;

  // Priority: selection > booked/uptake > blocked hatch > empty
  let bg = "transparent";
  if (selected) {
    bg = "var(--overlay-marquee)";
  } else if (occupied && isUptake) {
    bg = "var(--color-grey-100)";
  } else if (occupied) {
    bg = "var(--color-navy-700)";
  } else if (blocked) {
    bg = "var(--pattern-blocked)";
  }

  const name =
    showName && mode === "admin" && occupied && !isUptake
      ? slot.occupants[0]?.patient_name
      : undefined;

  return (
    <div
      className="relative box-border border-r border-[var(--color-grey-200)]"
      style={{
        height: "var(--grid-row-height)",
        background: bg,
        borderTop: hourBoundary
          ? "1px solid var(--grid-hour-border)"
          : "1px solid var(--grid-quarter-border)",
        cursor: softCol ? "default" : mode === "patient" ? "pointer" : "crosshair",
        opacity: isUptake ? 0.85 : 1,
      }}
      aria-label={reserved ? strings.grid.unavailable : undefined}
      data-blocked={blocked ? "true" : undefined}
      data-uptake={isUptake ? "true" : undefined}
      onMouseDown={softCol || mode === "patient" ? undefined : onMouseDown}
      onMouseEnter={softCol || mode === "patient" ? undefined : onMouseEnter}
      onClick={() => {
        if (reserved) onReservedClick?.();
      }}
    >
      {name ? (
        <span className="absolute inset-x-0.5 top-0.5 truncate text-[length:var(--text-10)] leading-none text-[var(--color-white)]">
          {name}
        </span>
      ) : null}
    </div>
  );
}
