import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { Button } from "../ui/Button";
import { strings } from "../../content/strings";
import { minutesToDurationLabel } from "../../lib/time";
import { ApiError } from "../../api/client";
import { useCancelBooking } from "../../hooks/useMyBookings";
import type { Booking } from "../../types/booking";
import { StepBreakdown } from "./StepBreakdown";
import {
  CancelAppointmentDialog,
  bookingDurationMinutes,
  bookingRangeLabel,
} from "./CancelAppointmentDialog";

interface Props {
  open: boolean;
  bookings: Booking[];
  loading: boolean;
  onClose: () => void;
  onCancelled: (date: string, range: string) => void;
}

function AppointmentRow({
  booking,
  past,
  expanded,
  onToggleSteps,
  onCancel,
}: {
  booking: Booking;
  past: boolean;
  expanded: boolean;
  onToggleSteps: () => void;
  onCancel: () => void;
}) {
  const dateLabel = format(parseISO(booking.date), "EEEE, d MMMM");
  const duration = minutesToDurationLabel(bookingDurationMinutes(booking));
  const range = bookingRangeLabel(booking);
  const name = booking.pathway_name ?? strings.patient.selectPathway;

  return (
    <li
      className={`rounded-[var(--radius-lg)] border border-[var(--color-grey-200)] px-4 py-3 ${
        past ? "opacity-60" : "bg-[var(--color-white)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
            {strings.confirmModal.pathwayLine(name, duration)}
          </div>
          <div className="mt-0.5 text-[length:var(--text-14)] text-[var(--color-grey-700)]">
            {dateLabel}
          </div>
          <div className="text-[length:var(--text-14)] tabular-nums text-[var(--color-grey-700)]">
            {range}
          </div>
        </div>
      </div>

      {booking.slots.length ? (
        <button
          type="button"
          className="mt-2 text-[length:var(--text-13)] font-medium text-[var(--color-grey-500)] hover:text-[var(--color-navy-900)]"
          onClick={onToggleSteps}
        >
          {expanded ? strings.myAppointments.hideSteps : strings.myAppointments.showSteps}
        </button>
      ) : null}

      {expanded ? (
        <div className="mt-2 border-t border-[var(--color-grey-200)] pt-2">
          <StepBreakdown slots={booking.slots} />
        </div>
      ) : null}

      {!past ? (
        <div className="mt-3">
          <Button type="button" variant="ghost" className="h-9 px-0" onClick={onCancel}>
            {strings.myAppointments.cancel}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function MyAppointmentsPanel({
  open,
  bookings,
  loading,
  onClose,
  onCancelled,
}: Props) {
  const cancel = useCancelBooking();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upcoming = bookings.filter((b) => !b.has_started);
  const past = bookings.filter((b) => b.has_started);

  const closePanel = () => {
    if (cancel.isPending) return;
    setPending(null);
    setError(null);
    onClose();
  };

  const confirmCancel = () => {
    if (!pending || cancel.isPending) return;
    const target = pending;
    const range = bookingRangeLabel(target);
    cancel.mutate(
      { id: target.id, date: target.date },
      {
        onSuccess: () => {
          setPending(null);
          setError(null);
          onCancelled(target.date, range);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 404) {
            setPending(null);
            setError(null);
            onCancelled(target.date, range);
            return;
          }
          setError(err instanceof ApiError ? err.message : strings.common.error);
        },
      },
    );
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: "var(--overlay-modal)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
          >
            <motion.div
              className="flex max-h-[min(720px,90vh)] w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--color-white)] shadow-[var(--shadow-md)]"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal
              aria-labelledby="my-appointments-title"
            >
              <div className="flex items-center justify-between border-b border-[var(--color-grey-200)] px-6 py-5">
                <h2
                  id="my-appointments-title"
                  className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
                  style={{ fontSize: "var(--text-20)" }}
                >
                  {strings.myAppointments.title}
                </h2>
                <button
                  type="button"
                  className="text-[length:var(--text-13)] font-medium text-[var(--color-grey-500)] hover:text-[var(--color-navy-900)]"
                  onClick={closePanel}
                >
                  {strings.myAppointments.closeAria}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {loading ? (
                  <p className="text-[length:var(--text-14)] text-[var(--color-grey-500)]">
                    {strings.common.loading}
                  </p>
                ) : upcoming.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
                      {strings.myAppointments.empty}
                    </p>
                    <p className="mt-1 text-[length:var(--text-13)] text-[var(--color-grey-500)]">
                      {strings.myAppointments.emptyHint}
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {upcoming.map((booking) => (
                      <AppointmentRow
                        key={booking.id}
                        booking={booking}
                        past={false}
                        expanded={expandedId === booking.id}
                        onToggleSteps={() =>
                          setExpandedId((id) => (id === booking.id ? null : booking.id))
                        }
                        onCancel={() => {
                          setError(null);
                          setPending(booking);
                        }}
                      />
                    ))}
                  </ul>
                )}

                {past.length ? (
                  <div className={upcoming.length ? "mt-8" : "mt-2"}>
                    <div className="mb-3 text-[length:var(--text-12)] font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]">
                      {strings.myAppointments.past}
                    </div>
                    <ul className="flex flex-col gap-3">
                      {past.map((booking) => (
                        <AppointmentRow
                          key={booking.id}
                          booking={booking}
                          past
                          expanded={expandedId === booking.id}
                          onToggleSteps={() =>
                            setExpandedId((id) => (id === booking.id ? null : booking.id))
                          }
                          onCancel={() => undefined}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CancelAppointmentDialog
        booking={pending}
        cancelling={cancel.isPending}
        error={error}
        onConfirm={confirmCancel}
        onKeep={() => {
          if (cancel.isPending) return;
          setPending(null);
          setError(null);
        }}
      />
    </>
  );
}
