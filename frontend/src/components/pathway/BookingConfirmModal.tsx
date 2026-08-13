import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { Button } from "../ui/Button";
import { strings } from "../../content/strings";
import { minutesToDurationLabel, slotIndexToLabel, slotRangeLabel } from "../../lib/time";
import type { BookingSearchResponse, BookingSlot } from "../../types/booking";
import type { Pathway } from "../../types/pathway";

export interface StepWindow {
  resource_type: string;
  start_slot: number;
  end_slot_exclusive: number;
}

/** Merge consecutive same-type booking slots into step windows (DB truth). */
export function buildStepWindows(slots: BookingSlot[]): StepWindow[] {
  if (!slots.length) return [];
  const sorted = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const windows: StepWindow[] = [];
  let start = sorted[0].slot_index;
  let prev = sorted[0].slot_index;
  let type = sorted[0].resource_type;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.resource_type === type && s.slot_index === prev + 1) {
      prev = s.slot_index;
      continue;
    }
    windows.push({ resource_type: type, start_slot: start, end_slot_exclusive: prev + 1 });
    start = s.slot_index;
    prev = s.slot_index;
    type = s.resource_type;
  }
  windows.push({ resource_type: type, start_slot: start, end_slot_exclusive: prev + 1 });
  return windows;
}

function labelForType(type: string): string {
  const key = type as keyof typeof strings.grid;
  return strings.grid[key] ?? type;
}

interface Props {
  open: boolean;
  pathway: Pathway;
  date: string;
  startSlot: number;
  /** Slots for the selected start — from search response shifted to startSlot. */
  slots: BookingSlot[];
  totalBlocks: number;
  confirming: boolean;
  conflictMessage?: string | null;
  suggestion?: BookingSearchResponse | null;
  onConfirm: () => void;
  onCancel: () => void;
  onUseSuggestion?: (start: number) => void;
}

export function BookingConfirmModal({
  open,
  pathway,
  date,
  startSlot,
  slots,
  totalBlocks,
  confirming,
  conflictMessage,
  suggestion,
  onConfirm,
  onCancel,
  onUseSuggestion,
}: Props) {
  const endExclusive = startSlot + totalBlocks;
  const windows = buildStepWindows(slots);
  const dateLabel = format(parseISO(date), "EEEE, d MMMM");
  const suggestionStart = suggestion?.earliest_start_slot ?? null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "var(--overlay-modal)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={confirming ? undefined : onCancel}
        >
          <motion.div
            className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--color-white)] shadow-[var(--shadow-md)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="confirm-booking-title"
          >
            <div className="flex flex-col gap-1 border-b border-[var(--color-grey-200)] px-6 py-5">
              <h2
                id="confirm-booking-title"
                className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
                style={{ fontSize: "var(--text-20)" }}
              >
                {strings.confirmModal.title}
              </h2>
              <p className="text-[length:var(--text-14)] text-[var(--color-grey-500)]">
                {strings.confirmModal.pathwayLine(
                  pathway.name,
                  minutesToDurationLabel(pathway.total_minutes),
                )}
              </p>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div>
                <div className="text-[length:var(--text-12)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]">
                  {strings.confirmModal.when}
                </div>
                <div className="mt-1 text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
                  {dateLabel}
                </div>
                <div className="text-[length:var(--text-14)] text-[var(--color-grey-700)]">
                  {slotRangeLabel(startSlot, endExclusive).replace(" to ", " — ")}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[length:var(--text-12)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]">
                  {strings.confirmModal.steps}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {windows.map((w) => (
                    <li
                      key={`${w.resource_type}-${w.start_slot}`}
                      className="flex items-center justify-between text-[length:var(--text-14)]"
                    >
                      <span className="font-medium text-[var(--color-navy-900)]">
                        {labelForType(w.resource_type)}
                      </span>
                      <span className="tabular-nums text-[var(--color-grey-700)]">
                        {slotIndexToLabel(w.start_slot)} — {slotIndexToLabel(w.end_slot_exclusive)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {conflictMessage ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-salmon-200)] bg-[var(--color-salmon-50)] px-3 py-2.5 text-[length:var(--text-13)] text-[var(--color-salmon-700)]">
                  <p>{conflictMessage}</p>
                  {suggestionStart != null && onUseSuggestion ? (
                    <button
                      type="button"
                      className="mt-2 font-medium underline"
                      onClick={() => onUseSuggestion(suggestionStart)}
                    >
                      {strings.confirmModal.jumpToSuggestion(
                        slotIndexToLabel(suggestionStart),
                      )}
                    </button>
                  ) : (
                    <p className="mt-1.5 text-[var(--color-grey-700)]">
                      {strings.confirmModal.noSuggestion}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex h-[72px] flex-none items-center justify-end gap-2.5 border-t border-[var(--color-grey-200)] bg-[var(--color-grey-50)] px-6">
              <Button type="button" variant="ghost" disabled={confirming} onClick={onCancel}>
                {strings.confirmModal.back}
              </Button>
              <Button
                type="button"
                disabled={confirming || !!conflictMessage}
                onClick={onConfirm}
              >
                {confirming ? strings.confirmModal.confirming : strings.confirmModal.confirm}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
