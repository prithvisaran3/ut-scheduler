import { addDays, format, isSaturday, isSunday, parseISO, startOfWeek } from "date-fns";
import { strings } from "../../content/strings";

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
}

/** Compact week pills with prev/next week — search works for any selected date. */
export function DateStrip({ selectedDate, onChange }: Props) {
  const selected = parseISO(selectedDate);
  const base = startOfWeek(selected, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(base, i));

  const shiftWeek = (delta: number) => {
    onChange(format(addDays(selected, delta * 7), "yyyy-MM-dd"));
  };

  return (
    <div className="ml-2 flex items-center gap-1">
      <button
        type="button"
        aria-label={strings.common.prevWeek}
        onClick={() => shiftWeek(-1)}
        className="rounded-[var(--radius-md)] px-1.5 py-[7px] font-medium text-[var(--color-grey-500)] hover:bg-[var(--color-grey-100)]"
        style={{ fontSize: "var(--text-12)" }}
      >
        ‹
      </button>
      <div className="flex items-center gap-1.5">
        {days.map((d) => {
          const value = format(d, "yyyy-MM-dd");
          const active = value === selectedDate;
          const weekend = isSaturday(d) || isSunday(d);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`rounded-[var(--radius-md)] px-3 py-[7px] font-medium ${
                active
                  ? "bg-[var(--color-navy-900)] text-[var(--color-white)]"
                  : weekend
                    ? "border border-[var(--color-grey-200)] text-[var(--color-grey-300)]"
                    : "border border-[var(--color-grey-200)] text-[var(--color-grey-500)]"
              }`}
              style={{ fontSize: "var(--text-12)" }}
            >
              {format(d, "EEE d")}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={strings.common.nextWeek}
        onClick={() => shiftWeek(1)}
        className="rounded-[var(--radius-md)] px-1.5 py-[7px] font-medium text-[var(--color-grey-500)] hover:bg-[var(--color-grey-100)]"
        style={{ fontSize: "var(--text-12)" }}
      >
        ›
      </button>
    </div>
  );
}
