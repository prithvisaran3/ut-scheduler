import { addDays, format, isSaturday, isSunday, parseISO, startOfWeek } from "date-fns";

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
}

/** Compact week pills — Frame 03: "Mon 11" / Navy-900 active, not tall day cards. */
export function DateStrip({ selectedDate, onChange }: Props) {
  const base = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(base, i));

  return (
    <div className="ml-2 flex items-center gap-1.5">
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
  );
}
