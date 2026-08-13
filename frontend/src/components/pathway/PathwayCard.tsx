import { strings } from "../../content/strings";
import { minutesToDurationLabel } from "../../lib/time";
import type { Pathway } from "../../types/pathway";
import { StencilPreview } from "./StencilPreview";

interface Props {
  pathway: Pathway;
  selected: boolean;
  onSelect: () => void;
}

export function PathwayCard({ pathway, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-0 flex-1 flex-col gap-[9px] rounded-[var(--radius-xl)] text-left transition ${
        selected
          ? "border-2 border-[var(--color-salmon-500)] bg-[var(--color-salmon-50)] px-[15px] py-[13px] shadow-[var(--shadow-glow-salmon)]"
          : "border border-[var(--color-grey-200)] bg-[var(--color-white)] px-4 py-3.5"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div
          className={`font-semibold ${
            selected ? "text-[var(--color-navy-900)]" : "text-[var(--color-grey-700)]"
          }`}
          style={{ fontSize: "var(--text-14)", lineHeight: 1.2 }}
        >
          {pathway.name}
        </div>
        {selected ? (
          <span
            className="font-medium uppercase tracking-[0.06em] text-[var(--color-salmon-700)]"
            style={{ fontSize: "var(--text-11)" }}
          >
            {strings.patient.selected}
          </span>
        ) : null}
      </div>
      <div
        className="text-[var(--color-grey-500)]"
        style={{ fontSize: "var(--text-12)", lineHeight: 1.4 }}
      >
        {strings.patient.blocksDuration(
          pathway.total_blocks,
          minutesToDurationLabel(pathway.total_minutes),
        )}
      </div>
      <StencilPreview pathway={pathway} muted={!selected} />
    </button>
  );
}
