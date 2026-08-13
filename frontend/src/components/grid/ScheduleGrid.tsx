import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleDay } from "../../types/schedule";
import type { BookingSearchResponse } from "../../types/booking";
import { strings } from "../../content/strings";
import { GridCell } from "./GridCell";
import { TimeGutter } from "./TimeGutter";
import { NowLine } from "./NowLine";
import { DragMarquee } from "./DragMarquee";
import { StencilSearchOverlay } from "../pathway/StencilSearchOverlay";
import { DAY_START_HOUR, SLOT_MINUTES } from "../../lib/scheduleConfig";

interface Props {
  schedule: ScheduleDay;
  mode: "patient" | "admin";
  searchResult?: BookingSearchResponse | null;
  searching?: boolean;
  onToggleSlots?: (args: {
    resource_type: "doctor" | "nmt" | "scan";
    slot_indices: number[];
    blocked: boolean;
  }) => void;
}

function currentSlotIndex(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = DAY_START_HOUR * 60;
  const idx = Math.floor((minutes - start) / SLOT_MINUTES);
  return idx;
}

export function ScheduleGrid({
  schedule,
  mode,
  searchResult = null,
  searching = false,
  onToggleSlots,
}: Props) {
  const columns = schedule.columns;
  const [drag, setDrag] = useState<{
    resourceType: "doctor" | "nmt" | "scan";
    start: number;
    end: number;
    colIndex: number;
  } | null>(null);

  const nowIdx = useMemo(() => currentSlotIndex(), []);
  // Recompute on an interval so the now-line tracks wall clock during a long session
  const [liveNowIdx, setLiveNowIdx] = useState(nowIdx);
  useEffect(() => {
    setLiveNowIdx(currentSlotIndex());
    const id = window.setInterval(() => setLiveNowIdx(currentSlotIndex()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onMouseUp = useCallback(() => {
    /* keep marquee until action */
  }, []);

  const beginDrag = (resourceType: string, slotIndex: number, colIndex: number) => {
    if (mode !== "admin") return;
    if (resourceType !== "doctor" && resourceType !== "nmt" && resourceType !== "scan") return;
    setDrag({ resourceType, start: slotIndex, end: slotIndex, colIndex });
  };

  const extendDrag = (slotIndex: number, colIndex: number) => {
    if (!drag || drag.colIndex !== colIndex) return;
    setDrag({ ...drag, end: slotIndex });
  };

  const applyDrag = (blocked: boolean) => {
    if (!drag || !onToggleSlots) return;
    const a = Math.min(drag.start, drag.end);
    const b = Math.max(drag.start, drag.end);
    const indices = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    onToggleSlots({ resource_type: drag.resourceType, slot_indices: indices, blocked });
    setDrag(null);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-auto bg-[var(--color-white)]"
      onMouseUp={onMouseUp}
      onMouseLeave={() => undefined}
    >
      <TimeGutter />
      <div className="relative flex min-w-0 flex-1">
        {columns.map((col, colIndex) => (
          <div key={`${col.resource_type}-${colIndex}`} className="relative min-w-0 flex-1">
            <div
              className="flex items-center border-b border-[var(--color-grey-300)] px-1.5 text-[length:var(--text-11)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
              style={{ height: "var(--grid-header-height)" }}
            >
              {strings.grid[col.resource_type as keyof typeof strings.grid] ?? col.name}
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
                  selected={
                    !!drag &&
                    drag.colIndex === colIndex &&
                    slot.slot_index >= Math.min(drag.start, drag.end) &&
                    slot.slot_index <= Math.max(drag.start, drag.end)
                  }
                  onMouseDown={() => beginDrag(col.resource_type, slot.slot_index, colIndex)}
                  onMouseEnter={() => extendDrag(slot.slot_index, colIndex)}
                />
              ))}
              {drag && drag.colIndex === colIndex ? (
                <DragMarquee
                  resourceType={drag.resourceType}
                  startSlot={drag.start}
                  endSlot={drag.end}
                  onBlock={() => applyDrag(true)}
                  onUnblock={() => applyDrag(false)}
                />
              ) : null}
            </div>
          </div>
        ))}

        <div
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: "var(--grid-header-height)" }}
        >
          <NowLine slotIndex={liveNowIdx} />
        </div>
      </div>

      {mode === "patient" ? (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{ top: "var(--grid-header-height)" }}
        >
          <StencilSearchOverlay result={searchResult} animating={searching || !!searchResult} />
        </div>
      ) : null}
    </div>
  );
}
