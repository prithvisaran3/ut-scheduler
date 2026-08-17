import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type Modifier,
} from "@dnd-kit/core";
import type { BookingSearchResponse, BookingSlot } from "../../types/booking";
import { strings } from "../../content/strings";
import { slotIndexToLabel } from "../../lib/time";
import { chipVariants, stencilFlightSpring, stepDelay } from "../../lib/motion";
import { nearestFeasibleStart } from "../../lib/pathwayPlacement";
import { GRID_ROW_HEIGHT_PX, SLOTS_PER_DAY } from "../../lib/scheduleConfig";

/**
 * Pixel math (must match GridCell):
 *   --grid-row-height / GRID_ROW_HEIGHT_PX = 24
 *   Overlay sits in the same relative parent as the cells, below the column
 *   header (--grid-header-height). Slot N top = N * 24px from that origin.
 *   No extra header offset inside the overlay.
 */
const ROW_H = GRID_ROW_HEIGHT_PX;

function columnBox(columns: string[], resourceType: string): { left: string; width: string } {
  const n = Math.max(columns.length, 1);
  const idx = Math.max(columns.indexOf(resourceType), 0);
  return {
    left: `${(idx / n) * 100}%`,
    width: `calc(${100 / n}% - 8px)`,
  };
}

const PLACEMENT_ID = "pathway-placement";

interface FootprintRun {
  resourceType: string;
  startSlot: number;
  endSlotExclusive: number;
}

/** Merge a pathway's slots into contiguous per-column runs (actual types only). */
export function buildFootprintRuns(slots: BookingSlot[]): FootprintRun[] {
  const byType = new Map<string, number[]>();
  for (const slot of slots) {
    const list = byType.get(slot.resource_type) ?? [];
    list.push(slot.slot_index);
    byType.set(slot.resource_type, list);
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

/** Shift earliest-fit slots so the pathway starts at `startSlot`. */
function slotsAtStart(slots: BookingSlot[], earliest: number, startSlot: number): BookingSlot[] {
  const delta = startSlot - earliest;
  if (delta === 0) return slots;
  return slots.map((s) => ({ ...s, slot_index: s.slot_index + delta }));
}

interface Props {
  result: BookingSearchResponse | null;
  animating: boolean;
  selectedStart: number | null;
  columns: string[];
  onSelectStart?: (start: number) => void;
  onAnimationComplete?: () => void;
}

function createSnapModifier(baseStart: number, feasible: number[]): Modifier {
  return ({ transform }) => {
    const deltaSlots = Math.round(transform.y / ROW_H);
    const snapped = nearestFeasibleStart(baseStart + deltaSlots, feasible) ?? baseStart;
    return {
      ...transform,
      x: 0,
      y: (snapped - baseStart) * ROW_H,
    };
  };
}

function lockPageScroll() {
  const body = document.body;
  const html = document.documentElement;
  const prevBody = body.style.overflow;
  const prevHtml = html.style.overflow;
  const prevTouch = body.style.touchAction;
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  body.style.touchAction = "none";
  const prevent = (e: Event) => {
    // Allow scrolling inside elements marked as grid scroll hosts.
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("[data-grid-scroll]")) return;
    e.preventDefault();
  };
  document.addEventListener("wheel", prevent, { passive: false });
  document.addEventListener("touchmove", prevent, { passive: false });
  return () => {
    body.style.overflow = prevBody;
    html.style.overflow = prevHtml;
    body.style.touchAction = prevTouch;
    document.removeEventListener("wheel", prevent);
    document.removeEventListener("touchmove", prevent);
  };
}

function FootprintRuns({
  runs,
  landed,
  ghosting,
  columns,
}: {
  runs: FootprintRun[];
  landed: boolean;
  ghosting?: boolean;
  columns: string[];
}) {
  return (
    <>
      {runs.map((run) => {
        const { left, width } = columnBox(columns, run.resourceType);
        const top = run.startSlot * ROW_H;
        const height = (run.endSlotExclusive - run.startSlot) * ROW_H;
        const soft = run.resourceType === "gap" || run.resourceType === "patient";

        return (
          <div
            key={`${run.resourceType}-${run.startSlot}`}
            className="absolute box-border"
            style={{
              top: top + 1,
              height: Math.max(height - 2, 2),
              left: `calc(${left} + 4px)`,
              width,
              borderRadius: "var(--radius-sm)",
              border: landed
                ? "1.5px solid var(--color-salmon-500)"
                : "1.5px solid var(--color-salmon-400)",
              background: landed
                ? "var(--color-salmon-100)"
                : "var(--overlay-stencil-flight)",
              boxShadow: landed ? "var(--shadow-glow-salmon)" : undefined,
              opacity: ghosting ? (soft ? 0.3 : 0.55) : soft ? 0.5 : landed ? 1 : 0.75,
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
  columns,
}: {
  runs: FootprintRun[];
  enabled: boolean;
  columns: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: PLACEMENT_ID,
    disabled: !enabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={
        enabled
          ? "pointer-events-auto cursor-grab touch-none active:cursor-grabbing"
          : "pointer-events-none"
      }
      style={{
        touchAction: "none",
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
      }}
      {...listeners}
      {...attributes}
    >
      <FootprintRuns runs={runs} landed ghosting={isDragging} columns={columns} />
    </div>
  );
}

export function StencilSearchOverlay({
  result,
  animating,
  selectedStart,
  columns,
  onSelectStart,
  onAnimationComplete,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "searching" | "landed">("idle");
  const [visibleRejects, setVisibleRejects] = useState<number>(0);
  const [dragging, setDragging] = useState(false);
  const pendingSnap = useRef<number | null>(null);

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

  useEffect(() => {
    if (!dragging) return;
    return lockPageScroll();
  }, [dragging]);

  const earliest = result?.earliest_start_slot ?? null;

  // Absolute slot positions for the currently displayed start (no outer translate stack).
  const displayStart =
    phase === "landed"
      ? selectedStart
      : phase === "searching" && visibleRejects > 0 && result
        ? result.rejected_attempts[visibleRejects - 1].slot_index
        : earliest;

  const runs = useMemo(() => {
    if (!result?.slots?.length || earliest == null || displayStart == null) return [];
    return buildFootprintRuns(slotsAtStart(result.slots, earliest, displayStart));
  }, [result, earliest, displayStart]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const baseStart = selectedStart;
  const snapModifier = useMemo(
    () =>
      baseStart != null && feasible.length ? createSnapModifier(baseStart, feasible) : undefined,
    [baseStart, feasible],
  );

  const onDragStart = () => {
    setDragging(true);
    pendingSnap.current = baseStart;
  };

  const onDragMove = (event: DragMoveEvent) => {
    if (baseStart == null) return;
    const deltaSlots = Math.round(event.delta.y / ROW_H);
    pendingSnap.current = nearestFeasibleStart(baseStart + deltaSlots, feasible) ?? baseStart;
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(false);
    if (baseStart == null || !onSelectStart) {
      pendingSnap.current = null;
      return;
    }
    const deltaSlots = Math.round(event.delta.y / ROW_H);
    const fromDelta = nearestFeasibleStart(baseStart + deltaSlots, feasible);
    const snapped = pendingSnap.current ?? fromDelta ?? baseStart;
    // Always commit a valid start (stay put if infeasible / cancelled).
    onSelectStart(snapped);
    pendingSnap.current = null;
  };

  const onDragCancel = () => {
    setDragging(false);
    pendingSnap.current = null;
    // Keep previous selection — deliberate no-op commit.
  };

  if (!result || earliest == null || selectedStart == null) {
    return null;
  }

  const dragEnabled = phase === "landed" && feasible.length > 0 && !!onSelectStart;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ height: SLOTS_PER_DAY * ROW_H }}>
      <AnimatePresence>
        {result.rejected_attempts.slice(0, visibleRejects).map((attempt) => (
          <motion.div
            key={`${attempt.slot_index}-${attempt.blocking_resource}`}
            className="pointer-events-none absolute"
            style={{ top: attempt.slot_index * ROW_H, left: 0 }}
            variants={chipVariants}
            initial="hidden"
            animate={phase === "landed" ? "fade" : "visible"}
          >
            <span className="pointer-events-none absolute right-full mr-1 inline-block whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-white)] px-1.5 py-1 text-[length:var(--text-10)] font-medium text-[var(--color-salmon-700)] blur-[0.4px]">
              {strings.patient.busyChip(
                slotIndexToLabel(attempt.slot_index),
                attempt.blocking_resource,
              )}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {dragEnabled ? (
        <DndContext
          sensors={sensors}
          modifiers={snapModifier ? [snapModifier] : []}
          autoScroll={{ threshold: { x: 0.15, y: 0.15 }, acceleration: 8 }}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="relative h-full w-full">
            <DraggablePlacement runs={runs} enabled columns={columns} />
          </div>
        </DndContext>
      ) : (
        <motion.div
          className="pointer-events-none relative h-full w-full"
          key={displayStart ?? "search"}
          initial={phase === "searching" ? { opacity: 0.7 } : false}
          animate={{ opacity: 1 }}
          transition={stencilFlightSpring}
        >
          <FootprintRuns runs={runs} landed={phase === "landed"} columns={columns} />
        </motion.div>
      )}
    </div>
  );
}
