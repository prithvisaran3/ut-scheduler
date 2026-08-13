import type { Pathway } from "../types/pathway";
import type { BookingSlot } from "../types/booking";
import type { StepType } from "./scheduleConfig";

/** Build grid slots for a pathway starting at `startSlot` (client-side placement). */
export function slotsForPathwayStart(pathway: Pathway, startSlot: number): BookingSlot[] {
  const steps = [...pathway.steps].sort((a, b) => a.sequence_order - b.sequence_order);
  const out: BookingSlot[] = [];
  let idx = startSlot;
  for (const step of steps) {
    for (let i = 0; i < step.block_count; i++) {
      out.push({
        slot_index: idx,
        resource_type: step.resource_type as StepType,
      });
      idx += 1;
    }
  }
  return out;
}

/** Nearest feasible start to a candidate slot index. */
export function nearestFeasibleStart(candidate: number, feasible: number[]): number | null {
  if (!feasible.length) return null;
  let best = feasible[0];
  let bestDist = Math.abs(candidate - best);
  for (const s of feasible) {
    const d = Math.abs(candidate - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
