import { strings } from "../../content/strings";
import { allSlotLabels } from "../../lib/time";
import { SLOT_MINUTES } from "../../lib/scheduleConfig";

const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

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
      {labels.map((label, i) => {
        const isHour = i % SLOTS_PER_HOUR === 0;
        return (
          <div
            key={`${label}-${i}`}
            className="time-label flex items-start px-2 pt-0.5"
            style={{
              height: "var(--grid-row-height)",
              borderTop: isHour
                ? "1px solid var(--grid-hour-border)"
                : "1px solid var(--grid-quarter-border)",
              fontSize: isHour ? "var(--text-11)" : "var(--text-10)",
              color: isHour ? "var(--color-grey-500)" : "var(--color-grey-300)",
              fontWeight: isHour ? 500 : 400,
            }}
          >
            {isHour ? label : ""}
          </div>
        );
      })}
    </div>
  );
}
