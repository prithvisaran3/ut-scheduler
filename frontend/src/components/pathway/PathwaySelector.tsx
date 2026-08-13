import type { Pathway } from "../../types/pathway";
import { PathwayCard } from "./PathwayCard";
import { strings } from "../../content/strings";

interface Props {
  pathways: Pathway[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Horizontal pathway card row above the schedule grid (Frame 02). */
export function PathwaySelector({ pathways, selectedId, onSelect }: Props) {
  if (pathways.length === 0) {
    return (
      <div className="flex flex-none flex-col gap-1 px-8 py-5">
        <div
          className="font-semibold text-[var(--color-ink)]"
          style={{ fontSize: "var(--text-16)" }}
        >
          {strings.patient.noPathwaysYet}
        </div>
        <div className="text-[var(--color-grey-500)]" style={{ fontSize: "var(--text-13)" }}>
          {strings.patient.noPathwaysHint}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-none items-stretch gap-4 px-8 py-5">
      {pathways.map((p) => (
        <PathwayCard
          key={p.id}
          pathway={p}
          selected={p.id === selectedId}
          onSelect={() => onSelect(p.id)}
        />
      ))}
    </div>
  );
}
