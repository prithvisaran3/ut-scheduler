import { strings } from "../../content/strings";

interface Props {
  pathwayName: string;
  durationLabel: string;
  onShowNextDay: () => void;
  onChooseDifferent: () => void;
  nextOpeningLabel?: string | null;
}

/** Frame 05 empty-state card — calendar-X icon, dynamic body, dual CTAs. */
export function EmptyStateCard({
  pathwayName,
  durationLabel,
  onShowNextDay,
  onChooseDifferent,
  nextOpeningLabel,
}: Props) {
  return (
    <div className="relative z-10 flex w-[480px] max-w-[calc(100%-2rem)] flex-col items-center gap-5 rounded-[var(--radius-xl)] border border-[var(--color-grey-200)] bg-[var(--color-white)] p-10 shadow-[var(--shadow-sm)]">
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        stroke="var(--color-navy-300)"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden
      >
        <rect x="6" y="11" width="44" height="38" rx="4" />
        <path d="M6 22h44" />
        <path d="M17 6v9" />
        <path d="M39 6v9" />
        <path d="M22 31l12 12" />
        <path d="M34 31l-12 12" />
      </svg>

      <div className="flex flex-col items-center gap-2 text-center">
        <h2
          className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
          style={{ fontSize: "var(--text-30)", lineHeight: 1.2 }}
        >
          {strings.empty.title}
        </h2>
        <p
          className="max-w-[360px] text-[var(--color-grey-500)]"
          style={{ fontSize: "var(--text-14)", lineHeight: 1.5 }}
        >
          {strings.empty.body(pathwayName, durationLabel)}
        </p>
      </div>

      <div className="mt-1 flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={onShowNextDay}
          className="flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-salmon-500)] font-medium text-[var(--color-white)] shadow-[var(--shadow-xs)]"
          style={{ fontSize: "var(--text-14)" }}
        >
          {strings.empty.showNext}
        </button>
        <button
          type="button"
          onClick={onChooseDifferent}
          className="flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] font-medium text-[var(--color-navy-900)]"
          style={{ fontSize: "var(--text-14)" }}
        >
          {strings.empty.chooseDifferent}
        </button>
      </div>

      {nextOpeningLabel ? (
        <div
          className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-300)]"
          style={{ fontSize: "var(--text-11)" }}
        >
          {strings.empty.nextOpening(nextOpeningLabel)}
        </div>
      ) : null}
    </div>
  );
}
