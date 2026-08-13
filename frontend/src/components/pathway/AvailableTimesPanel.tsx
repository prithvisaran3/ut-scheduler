import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";

interface Props {
  feasibleStarts: number[];
  totalBlocks: number;
  selectedStart: number | null;
  onSelect: (start: number) => void;
}

/** Right-rail list of feasible pathway start times for the patient booking page. */
export function AvailableTimesPanel({
  feasibleStarts,
  totalBlocks,
  selectedStart,
  onSelect,
}: Props) {
  return (
    <aside className="flex w-[340px] flex-none flex-col gap-3 border-l border-[var(--color-grey-200)] bg-[var(--color-grey-50)] p-5">
      <div className="flex items-baseline justify-between">
        <div
          className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
          style={{ fontSize: "var(--text-20)" }}
        >
          {strings.patient.availableTimes}
        </div>
        <div
          className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]"
          style={{ fontSize: "var(--text-11)" }}
        >
          {feasibleStarts.length}
        </div>
      </div>

      <div
        className="text-[var(--color-grey-500)]"
        style={{ fontSize: "var(--text-12)", lineHeight: 1.4 }}
      >
        {strings.patient.dragHint}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {feasibleStarts.length === 0 ? (
          <div
            className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-grey-300)] bg-[var(--color-white)] px-3.5 py-6 text-center text-[var(--color-grey-500)]"
            style={{ fontSize: "var(--text-13)", lineHeight: 1.4 }}
          >
            {strings.patient.noTimesToday}
          </div>
        ) : (
          feasibleStarts.map((start, i) => {
            const end = start + totalBlocks;
            const active = start === selectedStart;
            return (
              <button
                key={start}
                type="button"
                onClick={() => onSelect(start)}
                className={`flex flex-col gap-0.5 rounded-[var(--radius-xl)] border px-3.5 py-3 text-left transition ${
                  active
                    ? "border-[var(--color-salmon-400)] bg-[var(--color-salmon-50)] shadow-[var(--shadow-xs)]"
                    : "border-[var(--color-grey-200)] bg-[var(--color-white)] hover:border-[var(--color-salmon-200)]"
                }`}
              >
                <span
                  className={`font-semibold ${active ? "text-[var(--color-salmon-700)]" : "text-[var(--color-navy-900)]"}`}
                  style={{ fontSize: "var(--text-14)", lineHeight: 1.2 }}
                >
                  {slotIndexToLabel(start)} — {slotIndexToLabel(end)}
                </span>
                <span
                  className="text-[var(--color-grey-500)]"
                  style={{ fontSize: "var(--text-12)" }}
                >
                  {active
                    ? strings.patient.selectedPlacement
                    : i === 0
                      ? strings.patient.earliestAvailable
                      : "\u00a0"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
