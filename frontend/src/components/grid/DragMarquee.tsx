import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";
import { GRID_ROW_HEIGHT_PX } from "../../lib/scheduleConfig";

interface Props {
  resourceType: string;
  startSlot: number;
  endSlot: number;
  onBlock: () => void;
  onUnblock: () => void;
  onCancel: () => void;
}

export function DragMarquee({
  resourceType,
  startSlot,
  endSlot,
  onBlock,
  onUnblock,
  onCancel,
}: Props) {
  const top = Math.min(startSlot, endSlot);
  const bottom = Math.max(startSlot, endSlot);
  const count = bottom - top + 1;
  const height = count * GRID_ROW_HEIGHT_PX;
  // Flip below the selection when near the header so the toolbar never covers column labels.
  const toolbarBelow = top <= 2;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        top: top * GRID_ROW_HEIGHT_PX,
        height,
        left: 0,
        right: 0,
        background: "var(--overlay-marquee)",
        border: "2px dashed var(--color-salmon-500)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div
        className={`pointer-events-auto absolute -left-2 flex items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] px-3 py-2 shadow-[var(--shadow-sm)] ${
          toolbarBelow ? "top-full mt-2" : "-top-11"
        }`}
      >
        <span className="text-[length:var(--text-13)] font-medium text-[var(--color-navy-900)]">
          {strings.admin.slotsSelected(count)} · {resourceType}
        </span>
        <span className="h-3.5 w-px bg-[var(--color-grey-200)]" />
        <button
          type="button"
          className="text-[length:var(--text-13)] font-medium text-[var(--color-salmon-700)]"
          onClick={onBlock}
        >
          {strings.admin.markUnavailable}
        </button>
        <button
          type="button"
          className="text-[length:var(--text-13)] font-medium text-[var(--color-navy-600)]"
          onClick={onUnblock}
        >
          {strings.admin.markAvailable}
        </button>
        <button
          type="button"
          className="text-[length:var(--text-13)] font-medium text-[var(--color-grey-500)]"
          onClick={onCancel}
          aria-label={strings.admin.cancelSelection}
        >
          {strings.admin.cancelSelection}
        </button>
      </div>
      <div
        className={`absolute left-3 text-[length:var(--text-11)] font-medium text-[var(--color-salmon-700)] ${
          toolbarBelow ? "bottom-full mb-1.5" : "top-full mt-1.5"
        }`}
      >
        {slotIndexToLabel(top)} — {slotIndexToLabel(bottom + 1)}
      </div>
    </div>
  );
}
