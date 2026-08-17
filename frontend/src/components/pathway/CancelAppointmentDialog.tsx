import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { Button } from "../ui/Button";
import { strings } from "../../content/strings";
import { minutesToDurationLabel, slotRangeLabel } from "../../lib/time";
import { SLOT_MINUTES } from "../../lib/scheduleConfig";
import type { Booking } from "../../types/booking";

export function bookingEndExclusive(booking: Booking): number {
  if (booking.end_slot != null) return booking.end_slot;
  if (booking.slots.length) {
    return Math.max(...booking.slots.map((s) => s.slot_index)) + 1;
  }
  return booking.start_slot + 1;
}

export function bookingDurationMinutes(booking: Booking): number {
  return Math.max(bookingEndExclusive(booking) - booking.start_slot, 1) * SLOT_MINUTES;
}

export function bookingRangeLabel(booking: Booking): string {
  return slotRangeLabel(booking.start_slot, bookingEndExclusive(booking)).replace(
    " to ",
    " — ",
  );
}

interface Props {
  booking: Booking | null;
  cancelling: boolean;
  error: string | null;
  onConfirm: () => void;
  onKeep: () => void;
}

export function CancelAppointmentDialog({
  booking,
  cancelling,
  error,
  onConfirm,
  onKeep,
}: Props) {
  const open = booking != null;
  const dateLabel = booking ? format(parseISO(booking.date), "EEEE, d MMMM") : "";
  const duration = booking ? minutesToDurationLabel(bookingDurationMinutes(booking)) : "";
  const range = booking ? bookingRangeLabel(booking) : "";

  return (
    <AnimatePresence>
      {open && booking ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "var(--overlay-modal)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={cancelling ? undefined : onKeep}
        >
          <motion.div
            className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--color-white)] shadow-[var(--shadow-md)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="cancel-appointment-title"
          >
            <div className="flex flex-col gap-1 border-b border-[var(--color-grey-200)] px-6 py-5">
              <h2
                id="cancel-appointment-title"
                className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
                style={{ fontSize: "var(--text-20)" }}
              >
                {strings.cancelDialog.title}
              </h2>
              <p className="text-[length:var(--text-14)] text-[var(--color-grey-500)]">
                {strings.confirmModal.pathwayLine(
                  booking.pathway_name ?? strings.patient.selectPathway,
                  duration,
                )}
              </p>
            </div>

            <div className="flex flex-col gap-3 px-6 py-5">
              <div>
                <div className="text-[length:var(--text-12)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]">
                  {strings.confirmModal.when}
                </div>
                <div className="mt-1 text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
                  {dateLabel}
                </div>
                <div className="text-[length:var(--text-14)] text-[var(--color-grey-700)]">
                  {range}
                </div>
              </div>
              <p className="text-[length:var(--text-14)] text-[var(--color-grey-700)]">
                {strings.cancelDialog.warning}
              </p>
              {error ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-salmon-200)] bg-[var(--color-salmon-50)] px-3 py-2.5 text-[length:var(--text-13)] text-[var(--color-salmon-700)]">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex h-[72px] flex-none items-center justify-end gap-2.5 border-t border-[var(--color-grey-200)] bg-[var(--color-grey-50)] px-6">
              <Button
                type="button"
                variant="danger"
                disabled={cancelling}
                onClick={onConfirm}
              >
                {cancelling ? strings.cancelDialog.confirming : strings.cancelDialog.confirm}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={cancelling}
                autoFocus
                onClick={onKeep}
              >
                {strings.cancelDialog.keep}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
