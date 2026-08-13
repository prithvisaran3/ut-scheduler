import type { Pathway } from "../../types/pathway";
import { PathwayCard } from "./PathwayCard";

interface Props {
  pathways: Pathway[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Horizontal pathway card row above the schedule grid (Frame 02). */
export function PathwaySelector({ pathways, selectedId, onSelect }: Props) {
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
