import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import type { BookingSearchResponse, BookingSlot } from "../../types/booking";
import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";
import { chipVariants, stencilFlightSpring, stepDelay } from "../../lib/motion";
import { nearestFeasibleStart } from "../../lib/pathwayPlacement";
import { GRID_ROW_HEIGHT_PX, SLOTS_PER_DAY } from "../../lib/scheduleConfig";

/** Spreadsheet columns under the time gutter: Doctor | NMT | Patient | Scan */
const COL_LEFT: Record<string, string> = {
  doctor: "0%",
  nmt: "25%",
  patient: "50%",
  gap: "50%", // uptake renders in the Patient column
  scan: "75%",
};

const ROW_H = GRID_ROW_HEIGHT_PX;
const PLACEMENT_ID = "pathway-placement";

interface FootprintRun {
  resourceType: string;
  startSlot: number;
  endSlotExclusive: number;
}

/** Merge a pathway's slots into contiguous per-column runs (no cross-column boxes).
 * Gap maps into the Patient column; every slot also paints Patient for continuity.
 */
export function buildFootprintRuns(slots: BookingSlot[]): FootprintRun[] {
  const byType = new Map<string, number[]>();
  for (const slot of slots) {
    const displayType = slot.resource_type === "gap" ? "patient" : slot.resource_type;
    const list = byType.get(displayType) ?? [];
    list.push(slot.slot_index);
    byType.set(displayType, list);
    if (displayType !== "patient") {
      const patientList = byType.get("patient") ?? [];
      patientList.push(slot.slot_index);
      byType.set("patient", patientList);
    }
  }

  const runs: FootprintRun[] = [];
  for (const [resourceType, indices] of byType) {
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
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
  selectedStart: number | null;
  onSelectStart?: (start: number) => void;
  onAnimationComplete?: () => void;
}

function createSnapModifier(baseStart: number, feasible: number[]): Modifier {
  return ({ transform }) => {
    const deltaSlots = Math.round(transform.y / ROW_H);
    const candidate = baseStart + deltaSlots;
    const snapped = nearestFeasibleStart(candidate, feasible) ?? baseStart;
    return {
      ...transform,
      x: 0,
      y: (snapped - baseStart) * ROW_H,
    };
  };
}

function FootprintRuns({
  runs,
  landed,
  ghosting,
}: {
  runs: FootprintRun[];
  landed: boolean;
  ghosting?: boolean;
}) {
  return (
    <>
      {runs.map((run) => {
        const left = COL_LEFT[run.resourceType] ?? "0%";
        const top = run.startSlot * ROW_H;
        const height = (run.endSlotExclusive - run.startSlot) * ROW_H;
        const isGap = run.resourceType === "gap" || run.resourceType === "patient";

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
              opacity: ghosting ? (isGap ? 0.3 : 0.55) : isGap ? 0.5 : landed ? 1 : 0.75,
            }}
          />
        );
      })}
    </>
  );
}

function DraggablePlacement({
  runs,
  enabled,
}: {
  runs: FootprintRun[];
  enabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: PLACEMENT_ID,
    disabled: !enabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={enabled ? "pointer-events-auto cursor-grab active:cursor-grabbing" : "pointer-events-none"}
      style={
        transform
          ? { transform: `translate3d(0, ${transform.y}px, 0)` }
          : undefined
      }
      {...listeners}
      {...attributes}
    >
      <FootprintRuns runs={runs} landed ghosting={isDragging} />
    </div>
  );
}

export function StencilSearchOverlay({
  result,
  animating,
  selectedStart,
  onSelectStart,
  onAnimationComplete,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "searching" | "landed">("idle");
  const [visibleRejects, setVisibleRejects] = useState<number>(0);

  const feasible = result?.feasible_starts?.length
    ? result.feasible_starts
    : result?.earliest_start_slot != null
      ? [result.earliest_start_slot]
      : [];

  useEffect(() => {
    if (!result || result.earliest_start_slot == null) {
      setPhase("idle");
      setVisibleRejects(0);
      return;
    }
    if (!animating) {
      setPhase("landed");
      setVisibleRejects(result.rejected_attempts.length);
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

  // Runs are always positioned at the earliest-fit absolute slots; we translate the group.
  const runs = useMemo(
    () => (result?.slots?.length ? buildFootprintRuns(result.slots) : []),
    [result],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const baseStart = selectedStart;
  const snapModifier = useMemo(
    () =>
      baseStart != null && feasible.length ? createSnapModifier(baseStart, feasible) : undefined,
    [baseStart, feasible],
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (baseStart == null || !onSelectStart) return;
    const deltaSlots = Math.round(event.delta.y / ROW_H);
    const snapped = nearestFeasibleStart(baseStart + deltaSlots, feasible);
    if (snapped != null) onSelectStart(snapped);
  };

  if (!result || result.earliest_start_slot == null || selectedStart == null) {
    return null;
  }

  const earliest = result.earliest_start_slot;

  const searchY =
    phase === "searching" && visibleRejects > 0
      ? result.rejected_attempts[visibleRejects - 1].slot_index
      : earliest;

  const displayStart = phase === "landed" ? selectedStart : searchY;
  const translateY = (displayStart - earliest) * ROW_H;
  const dragEnabled = phase === "landed" && feasible.length > 0 && !!onSelectStart;

  return (
    <div className="absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {result.rejected_attempts.slice(0, visibleRejects).map((attempt) => (
          <motion.div
            key={`${attempt.slot_index}-${attempt.blocking_resource}`}
            className="pointer-events-none absolute left-0 w-[var(--grid-gutter-width)] pr-2 text-right"
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

      <div className="absolute left-[var(--grid-gutter-width)] right-0 top-0">
        {dragEnabled ? (
          <DndContext
            sensors={sensors}
            modifiers={snapModifier ? [snapModifier] : []}
            onDragEnd={onDragEnd}
          >
            <motion.div
              className="relative"
              initial={false}
              animate={{ y: translateY }}
              transition={stencilFlightSpring}
            >
              <DraggablePlacement runs={runs} enabled />
            </motion.div>
          </DndContext>
        ) : (
          <motion.div
            className="pointer-events-none relative"
            initial={false}
            animate={{ y: translateY }}
            transition={stencilFlightSpring}
          >
            <FootprintRuns runs={runs} landed={phase === "landed"} />
          </motion.div>
        )}
      </div>

      <div className="pointer-events-none" style={{ height: SLOTS_PER_DAY * ROW_H }} />
    </div>
  );
}
