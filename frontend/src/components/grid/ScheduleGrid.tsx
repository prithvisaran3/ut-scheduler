import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleDay } from "../../types/schedule";
import type { BookingSearchResponse } from "../../types/booking";
import { strings } from "../../content/strings";
import { GridCell } from "./GridCell";
import { TimeGutter } from "./TimeGutter";
import { NowLine } from "./NowLine";
import { DragMarquee } from "./DragMarquee";
import { StencilSearchOverlay } from "../pathway/StencilSearchOverlay";
import { GRID_ROW_HEIGHT_PX } from "../../lib/scheduleConfig";
import { clinicSlotIndex } from "../../lib/time";

interface Props {
  schedule: ScheduleDay;
  mode: "patient" | "admin";
  selectedDate?: string;
  searchResult?: BookingSearchResponse | null;
  searching?: boolean;
  selectedStart?: number | null;
  onSelectStart?: (start: number) => void;
  onSearchAnimationComplete?: () => void;
  onReservedClick?: () => void;
  onToggleSlots?: (args: {
    resource_type: "doctor" | "nmt" | "scan";
    slot_indices: number[];
    blocked: boolean;
  }) => void;
}

export function ScheduleGrid({
  schedule,
  mode,
  selectedDate,
  searchResult = null,
  searching = false,
  selectedStart = null,
  onSelectStart,
  onSearchAnimationComplete,
  onReservedClick,
  onToggleSlots,
}: Props) {
  const columns = schedule.columns;
  const rootRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    resourceType: "doctor" | "nmt" | "scan";
    start: number;
    end: number;
    colIndex: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // The backend owns "now". We only extrapolate between fetches, correcting for
  // any drift between the browser's clock and the server's.
  const { clinic_now: clinicNow, clinic_timezone: clinicTz } = schedule;
  const [liveNowIdx, setLiveNowIdx] = useState(schedule.current_slot_index);
  useEffect(() => {
    const skewMs = Date.parse(clinicNow) - Date.now();
    const tick = () => setLiveNowIdx(clinicSlotIndex(Date.now() + skewMs, clinicTz));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [clinicNow, clinicTz]);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => setIsDragging(false);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging]);

  // An afternoon placement lands below the fold, so bring it into view — but
  // only once the search animation has landed, or we scroll away from it.
  const placementBlocks = searchResult?.total_blocks ?? 0;
  useEffect(() => {
    if (searching || selectedStart == null || placementBlocks === 0) return;
    const root = rootRef.current;
    const rows = rowsRef.current;
    if (!root || !rows) return;

    const rowsOrigin =
      rows.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    const top = rowsOrigin + selectedStart * GRID_ROW_HEIGHT_PX;
    const height = placementBlocks * GRID_ROW_HEIGHT_PX;
    if (top >= root.scrollTop && top + height <= root.scrollTop + root.clientHeight) return;

    root.scrollTo({
      top: Math.max(top - Math.max((root.clientHeight - height) / 2, 16), 0),
      behavior: "smooth",
    });
  }, [searching, selectedStart, placementBlocks]);

  // Stale selection must not survive a day change.
  useEffect(() => {
    setDrag(null);
    setIsDragging(false);
  }, [selectedDate]);

  const clearSelection = useCallback(() => {
    setDrag(null);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (mode !== "admin" || !drag) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) {
        // Clicks on the marquee toolbar stay inside root — keep selection.
        return;
      }
      clearSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    // Capture so we see outside clicks before they bubble elsewhere.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [mode, drag, clearSelection]);

  const beginDrag = (resourceType: string, slotIndex: number, colIndex: number) => {
    if (mode !== "admin") return;
    if (resourceType !== "doctor" && resourceType !== "nmt" && resourceType !== "scan") return;
    setIsDragging(true);
    setDrag({ resourceType, start: slotIndex, end: slotIndex, colIndex });
  };

  const extendDrag = (slotIndex: number, colIndex: number) => {
    if (!isDragging || !drag || drag.colIndex !== colIndex) return;
    setDrag({ ...drag, end: slotIndex });
  };

  const endDragGesture = () => {
    setIsDragging(false);
  };

  const applyDrag = (blocked: boolean) => {
    if (!drag || !onToggleSlots) return;
    const a = Math.min(drag.start, drag.end);
    const b = Math.max(drag.start, drag.end);
    const indices = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    onToggleSlots({ resource_type: drag.resourceType, slot_indices: indices, blocked });
    clearSelection();
  };

  return (
    <div
      ref={rootRef}
      data-grid-scroll
      className="relative flex min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--color-white)]"
      onMouseUp={endDragGesture}
      onMouseLeave={endDragGesture}
    >
      {/* Single positioning context so overlay/now-line share GridCell slot origin
          and scroll with the cells (not the page / scrollport). */}
      <div className="relative flex min-w-0 flex-1">
        <TimeGutter />
        <div className="relative flex min-w-0 flex-1">
          {columns.map((col, colIndex) => (
            <div key={`${col.resource_type}-${colIndex}`} className="relative min-w-0 flex-1">
              <div
                className="flex items-center border-b border-[var(--color-grey-300)] px-1.5 text-[length:var(--text-11)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                style={{ height: "var(--grid-header-height)" }}
              >
                {col.resource_type === "patient" && mode === "patient"
                  ? strings.grid.you
                  : (strings.grid[col.resource_type as keyof typeof strings.grid] ?? col.name)}
                {mode === "admin" && col.capacity > 0 && col.resource_type !== "patient" ? (
                  <span className="ml-auto text-[var(--color-grey-500)] normal-case tracking-normal">
                    {Math.round(
                      (col.slots.filter((s) => s.occupied > 0 || s.blocked).length /
                        col.slots.length) *
                        100,
                    )}
                    %
                  </span>
                ) : null}
              </div>
              <div className="relative">
                {col.slots.map((slot) => (
                  <GridCell
                    key={slot.slot_index}
                    slot={slot}
                    resourceType={col.resource_type}
                    mode={mode}
                    showName={(() => {
                      if (
                        mode !== "admin" ||
                        slot.occupied <= 0 ||
                        !slot.occupants[0]?.patient_name
                      ) {
                        return false;
                      }
                      if (slot.is_uptake) return false;
                      const prev = col.slots[slot.slot_index - 1];
                      const bid = slot.occupants[0]?.booking_id;
                      if (!prev || prev.occupied <= 0) return true;
                      return prev.occupants[0]?.booking_id !== bid;
                    })()}
                    selected={
                      !!drag &&
                      drag.colIndex === colIndex &&
                      slot.slot_index >= Math.min(drag.start, drag.end) &&
                      slot.slot_index <= Math.max(drag.start, drag.end)
                    }
                    onMouseDown={() => beginDrag(col.resource_type, slot.slot_index, colIndex)}
                    onMouseEnter={() => extendDrag(slot.slot_index, colIndex)}
                    onReservedClick={onReservedClick}
                  />
                ))}
                {drag && drag.colIndex === colIndex ? (
                  <DragMarquee
                    resourceType={drag.resourceType}
                    startSlot={drag.start}
                    endSlot={drag.end}
                    onBlock={() => applyDrag(true)}
                    onUnblock={() => applyDrag(false)}
                    onCancel={clearSelection}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Cell origin = below header. Slot N → top: N * 24px. Scrolls with content. */}
        <div
          ref={rowsRef}
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20"
          style={{ top: "var(--grid-header-height)" }}
        >
          <div className="relative h-full" style={{ marginLeft: "var(--grid-gutter-width)" }}>
            {/* Only the clinic's today has a "now" — other days must not show a line. */}
            {schedule.date === schedule.clinic_today ? <NowLine slotIndex={liveNowIdx} /> : null}
          </div>
          {mode === "patient" ? (
            <div className="absolute inset-0" style={{ left: "var(--grid-gutter-width)" }}>
              <StencilSearchOverlay
                result={searchResult}
                animating={searching}
                selectedStart={selectedStart}
                onSelectStart={onSelectStart}
                onAnimationComplete={onSearchAnimationComplete}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
