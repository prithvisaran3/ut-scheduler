import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { PathwaySelector } from "../components/pathway/PathwaySelector";
import { EmptyStateCard } from "../components/pathway/EmptyStateCard";
import { AvailableTimesPanel } from "../components/pathway/AvailableTimesPanel";
import { DateStrip } from "../components/common/DateStrip";
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
  const [selectedStart, setSelectedStart] = useState<number | null>(null);

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
      setSelectedStart(null);
      return;
    }
    setLanded(false);
    setResult(null);
    setSelectedStart(null);
    search.mutate(
      { pathway_id: selectedPathwayId, date: selectedDate },
      {
        onSuccess: (data) => {
          setResult(data);
          setSelectedStart(data.earliest_start_slot);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPathwayId, selectedDate]);

  const noFit = result && result.earliest_start_slot == null;
  const selectedPathway = useMemo(
    () => pathways.data?.find((p) => p.id === selectedPathwayId) ?? null,
    [pathways.data, selectedPathwayId],
  );

  const feasibleStarts = result?.feasible_starts?.length
    ? result.feasible_starts
    : result?.earliest_start_slot != null
      ? [result.earliest_start_slot]
      : [];

  const canConfirm =
    !!result &&
    selectedStart != null &&
    feasibleStarts.includes(selectedStart) &&
    !!selectedPathwayId &&
    !confirm.isPending &&
    landed;

  const placementEnd =
    selectedStart != null && result ? selectedStart + result.total_blocks : null;

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
          <DateStrip selectedDate={selectedDate} onChange={setSelectedDate} />
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

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-[1_1_65%] flex-col px-8 pb-0">
          {schedule.data ? (
            <div className={noFit ? "min-h-0 flex-1 opacity-50 blur-[3px]" : "min-h-0 flex-1"}>
              <ScheduleGrid
                schedule={schedule.data}
                mode="patient"
                selectedDate={selectedDate}
                searchResult={noFit ? null : result}
                searching={!noFit && (search.isPending || (!!result && !landed))}
                selectedStart={noFit ? null : selectedStart}
                onSelectStart={setSelectedStart}
                onSearchAnimationComplete={() => setLanded(true)}
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

        {!noFit ? (
          <AvailableTimesPanel
            feasibleStarts={feasibleStarts}
            totalBlocks={result?.total_blocks ?? 0}
            selectedStart={selectedStart}
            onSelect={setSelectedStart}
          />
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
              : selectedStart != null && placementEnd != null
                ? `${strings.patient.selected} — ${slotRangeLabel(selectedStart, placementEnd)}`
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
        <Button
          type="button"
          disabled={!canConfirm}
          onClick={() => {
            if (!canConfirm || selectedStart == null || !selectedPathwayId) return;
            confirm.mutate({
              pathway_id: selectedPathwayId,
              date: selectedDate,
              start_slot: selectedStart,
            });
          }}
        >
          {strings.patient.confirm}
        </Button>
      </footer>
    </div>
  );
}
