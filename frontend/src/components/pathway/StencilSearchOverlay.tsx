import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BookingSearchResponse, BookingSlot } from "../../types/booking";
import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";
import { chipVariants, stencilFlightSpring, stepDelay } from "../../lib/motion";
import { SLOTS_PER_DAY } from "../../lib/scheduleConfig";

/** Patient grid columns under the time gutter: doctor / nmt / gap / scan */
const COL_LEFT: Record<string, string> = {
  doctor: "0%",
  nmt: "25%",
  gap: "50%",
  scan: "75%",
};

const ROW_H = 32; // matches --grid-row-height

interface FootprintRun {
  resourceType: string;
  startSlot: number;
  endSlotExclusive: number;
}

/** Merge a pathway's slots into contiguous per-column runs (no cross-column boxes). */
export function buildFootprintRuns(slots: BookingSlot[]): FootprintRun[] {
  const byType = new Map<string, number[]>();
  for (const slot of slots) {
    const list = byType.get(slot.resource_type) ?? [];
    list.push(slot.slot_index);
    byType.set(slot.resource_type, list);
  }

  const runs: FootprintRun[] = [];
  for (const [resourceType, indices] of byType) {
    const sorted = [...indices].sort((a, b) => a - b);
    let runStart = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      runs.push({
        resourceType,
        startSlot: runStart,
        endSlotExclusive: prev + 1,
      });
      runStart = sorted[i];
      prev = sorted[i];
    }
    runs.push({
      resourceType,
      startSlot: runStart,
      endSlotExclusive: prev + 1,
    });
  }
  return runs;
}

interface Props {
  result: BookingSearchResponse | null;
  animating: boolean;
  onAnimationComplete?: () => void;
}

export function StencilSearchOverlay({ result, animating, onAnimationComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "searching" | "landed">("idle");
  const [visibleRejects, setVisibleRejects] = useState<number>(0);

  useEffect(() => {
    if (!result || !animating) {
      setPhase("idle");
      setVisibleRejects(0);
      return;
    }

    setPhase("searching");
    setVisibleRejects(0);
    const rejects = result.rejected_attempts;
    const timers: number[] = [];

    rejects.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => setVisibleRejects(i + 1), stepDelay(i) * 1000 + 120),
      );
    });

    const landAt = stepDelay(Math.max(rejects.length, 1)) * 1000 + 350;
    timers.push(
      window.setTimeout(() => {
        setPhase("landed");
        onAnimationComplete?.();
      }, landAt),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [result, animating, onAnimationComplete]);

  const runs = useMemo(
    () => (result?.slots?.length ? buildFootprintRuns(result.slots) : []),
    [result],
  );

  if (!result || result.earliest_start_slot == null) {
    return null;
  }

  const start = result.earliest_start_slot;

  // During search, the footprint shape descends through rejected starts then snaps to winner
  const searchY =
    phase === "searching" && result.rejected_attempts.length > 0
      ? (result.rejected_attempts[
          Math.min(visibleRejects, result.rejected_attempts.length) - 1
        ]?.slot_index ?? start)
      : start;

  const y = phase === "landed" ? start : Math.min(searchY, start);
  // Runs are positioned at absolute winning slots; translate the group so the
  // stencil shape flies as a unit through candidate starts.
  const translateY = (y - start) * ROW_H;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* Rejected attempt chips in the time gutter only — not full-window ghosts */}
      <AnimatePresence>
        {result.rejected_attempts.slice(0, visibleRejects).map((attempt) => (
          <motion.div
            key={`${attempt.slot_index}-${attempt.blocking_resource}`}
            className="absolute left-0 w-[var(--grid-gutter-width)] pr-2 text-right"
            style={{ top: attempt.slot_index * ROW_H }}
            variants={chipVariants}
            initial="hidden"
            animate={phase === "landed" ? "fade" : "visible"}
          >
            <span className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-white)] px-1.5 py-1 text-[length:var(--text-10)] font-medium text-[var(--color-salmon-700)] blur-[0.4px]">
              {strings.patient.busyChip(
                slotIndexToLabel(attempt.slot_index),
                attempt.blocking_resource,
              )}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Per-column footprint runs — never a single cross-column bounding box */}
      <motion.div
        className="absolute left-[var(--grid-gutter-width)] right-0 top-0"
        initial={false}
        animate={{ y: translateY }}
        transition={stencilFlightSpring}
      >
        {runs.map((run) => {
          const left = COL_LEFT[run.resourceType] ?? "0%";
          const top = run.startSlot * ROW_H;
          const height = (run.endSlotExclusive - run.startSlot) * ROW_H;
          const isGap = run.resourceType === "gap";
          const landed = phase === "landed";

          return (
            <div
              key={`${run.resourceType}-${run.startSlot}`}
              className="absolute box-border"
              style={{
                top: top + 2,
                height: height - 4,
                left: `calc(${left} + 4px)`,
                width: "calc(25% - 8px)",
                borderRadius: "var(--radius-sm)",
                border: landed
                  ? "1.5px solid var(--color-salmon-500)"
                  : "1.5px solid var(--color-salmon-400)",
                background: landed
                  ? "var(--color-salmon-100)"
                  : "var(--overlay-stencil-flight)",
                boxShadow: landed ? "var(--shadow-glow-salmon)" : undefined,
                opacity: isGap ? 0.5 : landed ? 1 : 0.75,
              }}
            />
          );
        })}
      </motion.div>

      {/* Spacer so absolute overlay covers the full day height */}
      <div style={{ height: SLOTS_PER_DAY * ROW_H }} />
    </div>
  );
}
