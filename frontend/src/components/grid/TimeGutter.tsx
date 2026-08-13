import { strings } from "../../content/strings";
import { allSlotLabels } from "../../lib/time";

export function TimeGutter() {
  const labels = allSlotLabels();
  return (
    <div className="w-[var(--grid-gutter-width)] flex-none border-r border-[var(--color-grey-200)]">
      <div
        className="flex items-center border-b border-[var(--color-grey-300)] px-2 text-[length:var(--text-11)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-300)]"
        style={{ height: "var(--grid-header-height)" }}
      >
        {strings.grid.time}
      </div>
      {labels.map((label) => (
        <div
          key={label}
          className="time-label flex items-start px-2 pt-1 text-[length:var(--text-11)] text-[var(--color-grey-500)]"
          style={{ height: "var(--grid-row-height)" }}
        >
          {label.endsWith(":00") ? label : ""}
        </div>
      ))}
    </div>
  );
}
