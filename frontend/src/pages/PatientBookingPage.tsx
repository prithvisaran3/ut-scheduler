import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { PathwaySelector } from "../components/pathway/PathwaySelector";
import { EmptyStateCard } from "../components/pathway/EmptyStateCard";
import { ScheduleGrid } from "../components/grid/ScheduleGrid";
import { Button } from "../components/ui/Button";
import { UserAvatarMenu } from "../components/ui/UserAvatarMenu";
import { strings } from "../content/strings";
import { usePathways } from "../hooks/usePathways";
import { useSchedule } from "../hooks/useSchedule";
import { useBookingSearch } from "../hooks/useBookingSearch";
import { useConfirmBooking } from "../hooks/useConfirmBooking";
import { useLogout } from "../hooks/useAuth";
import { useScheduleStore } from "../store/scheduleStore";
import { useAuthStore } from "../store/authStore";
import { minutesToDurationLabel, slotRangeLabel } from "../lib/time";
import type { BookingSearchResponse } from "../types/booking";

export function PatientBookingPage() {
  const fullName = useAuthStore((s) => s.fullName);
  const logout = useLogout();
  const { selectedDate, selectedPathwayId, setSelectedDate, setSelectedPathwayId } =
    useScheduleStore();
  const pathways = usePathways();
  const schedule = useSchedule(selectedDate);
  const search = useBookingSearch();
  const confirm = useConfirmBooking();

  const [result, setResult] = useState<BookingSearchResponse | null>(null);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!pathways.data) return;
    if (pathways.data.length === 0) {
      if (selectedPathwayId) setSelectedPathwayId(null);
      return;
    }
    if (!selectedPathwayId || !pathways.data.some((p) => p.id === selectedPathwayId)) {
      setSelectedPathwayId(pathways.data[0].id);
    }
  }, [pathways.data, selectedPathwayId, setSelectedPathwayId]);

  useEffect(() => {
    if (!selectedPathwayId) {
      setLanded(false);
      setResult(null);
      return;
    }
    setLanded(false);
    setResult(null);
    search.mutate(
      { pathway_id: selectedPathwayId, date: selectedDate },
      {
        onSuccess: (data) => setResult(data),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPathwayId, selectedDate]);

  const noFit = result && result.earliest_start_slot == null;
  const dateLabel = format(parseISO(selectedDate), "EEEE, d MMMM");
  const selectedPathway = useMemo(
    () => pathways.data?.find((p) => p.id === selectedPathwayId) ?? null,
    [pathways.data, selectedPathwayId],
  );

  return (
    <div className="flex h-screen flex-col bg-[var(--color-white)]">
      <header className="flex h-16 flex-none items-center justify-between border-b border-[var(--color-grey-200)] bg-[var(--color-white)] px-8">
        <div className="flex items-center gap-3.5">
          <div
            className="font-semibold tracking-[-0.01em] text-[var(--color-navy-900)]"
            style={{ fontSize: "var(--text-15)" }}
          >
            {strings.appName}
          </div>
          <div className="h-[18px] w-px bg-[var(--color-grey-200)]" />
          <div
            className="text-[var(--color-grey-500)]"
            style={{ fontSize: "var(--text-13)" }}
          >
            {dateLabel}
          </div>
        </div>
        <UserAvatarMenu
          fullName={fullName}
          roleLabel={strings.common.patient}
          onLogout={logout}
          logoutLabel={strings.patient.logout}
        />
      </header>

      {pathways.data ? (
        <PathwaySelector
          pathways={pathways.data}
          selectedId={selectedPathwayId}
          onSelect={setSelectedPathwayId}
        />
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-8 pb-0">
        {schedule.data ? (
          <div className={noFit ? "min-h-0 flex-1 opacity-50 blur-[3px]" : "min-h-0 flex-1"}>
            <ScheduleGrid
              schedule={schedule.data}
              mode="patient"
              searchResult={noFit ? null : result}
              searching={!noFit && (search.isPending || (!!result && !landed))}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--color-grey-500)]">
            {strings.common.loading}
          </div>
        )}

        {noFit && selectedPathway ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--overlay-modal)]/30">
            <EmptyStateCard
              pathwayName={selectedPathway.name}
              durationLabel={minutesToDurationLabel(selectedPathway.total_minutes)}
              onShowNextDay={() =>
                setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))
              }
              onChooseDifferent={() => {
                if (!pathways.data?.length) return;
                const idx = pathways.data.findIndex((p) => p.id === selectedPathwayId);
                const next = pathways.data[(idx + 1) % pathways.data.length];
                setSelectedPathwayId(next.id);
              }}
            />
          </div>
        ) : null}
      </div>

      <footer
        className="flex h-[88px] flex-none items-center justify-between border-t border-[var(--color-grey-200)] bg-[var(--color-white)] px-8"
        style={{ boxShadow: "var(--shadow-bottom-bar)" }}
      >
        <div>
          <div className="text-[length:var(--text-30)] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
            {!selectedPathwayId
              ? strings.patient.noPathwaysYet
              : result?.earliest_start_slot != null && result.end_slot != null
                ? `${strings.patient.earliestAvailable} — ${slotRangeLabel(result.earliest_start_slot, result.end_slot)}`
                : noFit
                  ? strings.empty.title
                  : strings.patient.searching}
          </div>
          {result && !noFit ? (
            <div className="text-[length:var(--text-14)] text-[var(--color-grey-500)]">
              {strings.patient.blocksPlaced(
                result.total_blocks,
                result.rejected_attempts.length,
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" type="button">
            {strings.patient.seeOtherTimes}
          </Button>
          <Button
            type="button"
            disabled={
              !result ||
              result.earliest_start_slot == null ||
              confirm.isPending ||
              !selectedPathwayId
            }
            onClick={() => {
              if (!result || result.earliest_start_slot == null || !selectedPathwayId) return;
              confirm.mutate({
                pathway_id: selectedPathwayId,
                date: selectedDate,
                start_slot: result.earliest_start_slot,
              });
            }}
          >
            {strings.patient.confirm}
          </Button>
        </div>
      </footer>
      {result && !landed && !noFit ? (
        <LandedWatcher
          delay={Math.max(result.rejected_attempts.length, 1) * 180 + 400}
          onDone={() => setLanded(true)}
        />
      ) : null}
    </div>
  );
}

function LandedWatcher({ delay, onDone }: { delay: number; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, delay);
    return () => window.clearTimeout(t);
  }, [delay, onDone]);
  return null;
}
