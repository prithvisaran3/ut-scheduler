import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, isSaturday, isSunday, parseISO } from "date-fns";
import { PathwaySelector } from "../components/pathway/PathwaySelector";
import { EmptyStateCard } from "../components/pathway/EmptyStateCard";
import { AvailableTimesPanel } from "../components/pathway/AvailableTimesPanel";
import { BookingConfirmModal } from "../components/pathway/BookingConfirmModal";
import { DateStrip } from "../components/common/DateStrip";
import { ScheduleGrid } from "../components/grid/ScheduleGrid";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
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
import { ApiError } from "../api/client";
import type { BookingSearchResponse, BookingSlot } from "../types/booking";

function shiftSlots(
  slots: BookingSlot[],
  earliest: number,
  startSlot: number,
): BookingSlot[] {
  const delta = startSlot - earliest;
  if (delta === 0) return slots;
  return slots.map((s) => ({ ...s, slot_index: s.slot_index + delta }));
}

function parseConflictSuggestion(err: ApiError): BookingSearchResponse | null {
  const body = err.body;
  if (typeof body !== "object" || !body || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail !== "object" || !detail || detail === null) return null;
  const suggestion = (detail as { suggestion?: unknown }).suggestion;
  if (!suggestion || typeof suggestion !== "object") return null;
  return suggestion as BookingSearchResponse;
}

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [conflictSuggestion, setConflictSuggestion] = useState<BookingSearchResponse | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const weekend = useMemo(() => {
    const d = parseISO(selectedDate);
    return isSaturday(d) || isSunday(d);
  }, [selectedDate]);

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
    if (!selectedPathwayId || weekend) {
      setLanded(false);
      setResult(null);
      setSelectedStart(null);
      setSearchError(null);
      return;
    }
    setLanded(false);
    setResult(null);
    setSelectedStart(null);
    setSearchError(null);
    search.mutate(
      { pathway_id: selectedPathwayId, date: selectedDate },
      {
        onSuccess: (data) => {
          setResult(data);
          setSelectedStart(data.earliest_start_slot);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 404) {
            setSearchError(strings.patient.pathwayGone);
            setSelectedPathwayId(null);
            void pathways.refetch();
            return;
          }
          setSearchError(
            err instanceof ApiError ? err.message : strings.common.error,
          );
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPathwayId, selectedDate, weekend]);

  const noFit = !weekend && result && result.earliest_start_slot == null;
  const selectedPathway = useMemo(
    () => pathways.data?.find((p) => p.id === selectedPathwayId) ?? null,
    [pathways.data, selectedPathwayId],
  );

  const feasibleStarts = result?.feasible_starts?.length
    ? result.feasible_starts
    : result?.earliest_start_slot != null
      ? [result.earliest_start_slot]
      : [];

  const canOpenConfirm =
    !weekend &&
    !!result &&
    selectedStart != null &&
    feasibleStarts.includes(selectedStart) &&
    !!selectedPathwayId &&
    !confirm.isPending &&
    landed;

  const placementEnd =
    selectedStart != null && result ? selectedStart + result.total_blocks : null;

  const placementSlots = useMemo(() => {
    if (!result?.slots?.length || result.earliest_start_slot == null || selectedStart == null) {
      return [];
    }
    return shiftSlots(result.slots, result.earliest_start_slot, selectedStart);
  }, [result, selectedStart]);

  const dismissToast = useCallback(() => setToast(null), []);

  const handleConfirm = () => {
    if (!canOpenConfirm || selectedStart == null || !selectedPathwayId) return;
    setConflictMessage(null);
    setConflictSuggestion(null);
    confirm.mutate(
      {
        pathway_id: selectedPathwayId,
        date: selectedDate,
        start_slot: selectedStart,
      },
      {
        onSuccess: () => {
          const range =
            placementEnd != null
              ? slotRangeLabel(selectedStart, placementEnd).replace(" to ", " — ")
              : "";
          setConfirmOpen(false);
          setToast(strings.patient.bookedSuccess(range));
          setLanded(false);
          setResult(null);
          setSelectedStart(null);
          void schedule.refetch();
          if (selectedPathwayId) {
            search.mutate(
              { pathway_id: selectedPathwayId, date: selectedDate },
              {
                onSuccess: (data) => {
                  setResult(data);
                  setSelectedStart(data.earliest_start_slot);
                },
              },
            );
          }
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setConflictMessage(strings.confirmModal.conflict);
            setConflictSuggestion(parseConflictSuggestion(err));
            return;
          }
          if (err instanceof ApiError && err.status === 404) {
            setConflictMessage(strings.patient.pathwayGone);
            return;
          }
          setConflictMessage(
            err instanceof ApiError ? err.message : strings.common.error,
          );
        },
      },
    );
  };

  const useSuggestion = (start: number) => {
    const suggestion = conflictSuggestion;
    setConfirmOpen(false);
    setConflictMessage(null);
    if (suggestion) {
      setResult(suggestion);
      setSelectedStart(start);
      setLanded(true);
    } else {
      setSelectedStart(start);
    }
    setConflictSuggestion(null);
  };

  const zeroPathways = pathways.data && pathways.data.length === 0;

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

      {pathways.data && pathways.data.length > 0 ? (
        <PathwaySelector
          pathways={pathways.data}
          selectedId={selectedPathwayId}
          onSelect={setSelectedPathwayId}
        />
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-[1_1_65%] flex-col px-8 pb-0">
          {schedule.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-[var(--color-grey-700)]">
              <p className="text-[length:var(--text-15)] font-medium">
                {strings.patient.loadError}
              </p>
              <p className="max-w-sm text-[length:var(--text-13)] text-[var(--color-grey-500)]">
                {schedule.error instanceof ApiError && schedule.error.status === 0
                  ? strings.patient.wakingUp
                  : schedule.error instanceof Error
                    ? schedule.error.message
                    : strings.common.error}
              </p>
              <Button type="button" variant="secondary" onClick={() => void schedule.refetch()}>
                {strings.patient.retry}
              </Button>
            </div>
          ) : schedule.data ? (
            <div className={noFit || weekend ? "min-h-0 flex-1 opacity-50 blur-[3px]" : "min-h-0 flex-1"}>
              <ScheduleGrid
                schedule={schedule.data}
                mode="patient"
                selectedDate={selectedDate}
                searchResult={noFit || weekend ? null : result}
                searching={!noFit && !weekend && (search.isPending || (!!result && !landed))}
                selectedStart={noFit || weekend ? null : selectedStart}
                onSelectStart={setSelectedStart}
                onSearchAnimationComplete={() => setLanded(true)}
                onReservedClick={() => setToast(strings.patient.slotUnavailable)}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--color-grey-500)]">
              <div>{strings.common.loading}</div>
              <div className="max-w-xs text-center text-[length:var(--text-12)]">
                {strings.patient.wakingUp}
              </div>
            </div>
          )}

          {weekend ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--overlay-modal)]/30">
              <div className="max-w-sm rounded-[var(--radius-2xl)] bg-[var(--color-white)] px-6 py-5 text-center shadow-[var(--shadow-md)]">
                <p className="text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
                  {strings.patient.weekendClosed}
                </p>
              </div>
            </div>
          ) : null}

          {zeroPathways ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--overlay-modal)]/30">
              <div className="max-w-sm rounded-[var(--radius-2xl)] bg-[var(--color-white)] px-6 py-5 text-center shadow-[var(--shadow-md)]">
                <p className="text-[length:var(--text-15)] font-semibold text-[var(--color-navy-900)]">
                  {strings.patient.noPathwaysYet}
                </p>
                <p className="mt-2 text-[length:var(--text-13)] text-[var(--color-grey-500)]">
                  {strings.patient.noPathwaysHint}
                </p>
              </div>
            </div>
          ) : null}

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

          {searchError ? (
            <div className="absolute inset-x-8 top-4 z-50 rounded-[var(--radius-md)] border border-[var(--color-salmon-200)] bg-[var(--color-salmon-50)] px-3 py-2 text-[length:var(--text-13)] text-[var(--color-salmon-700)]">
              {searchError}
            </div>
          ) : null}
        </div>

        {!noFit && !weekend && !zeroPathways ? (
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
            {zeroPathways
              ? strings.patient.noPathwaysYet
              : weekend
                ? strings.patient.weekendClosed
                : !selectedPathwayId
                  ? strings.patient.noPathwaysYet
                  : selectedStart != null && placementEnd != null
                    ? `${strings.patient.selected} — ${slotRangeLabel(selectedStart, placementEnd)}`
                    : noFit
                      ? strings.empty.title
                      : strings.patient.searching}
          </div>
          {result && !noFit && !weekend ? (
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
          disabled={!canOpenConfirm}
          onClick={() => {
            if (!canOpenConfirm) return;
            setConflictMessage(null);
            setConflictSuggestion(null);
            setConfirmOpen(true);
          }}
        >
          {strings.patient.confirm}
        </Button>
      </footer>

      {selectedPathway && selectedStart != null && result ? (
        <BookingConfirmModal
          open={confirmOpen}
          pathway={selectedPathway}
          date={selectedDate}
          startSlot={selectedStart}
          slots={placementSlots}
          totalBlocks={result.total_blocks}
          confirming={confirm.isPending}
          conflictMessage={conflictMessage}
          suggestion={conflictSuggestion}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (confirm.isPending) return;
            setConfirmOpen(false);
            setConflictMessage(null);
            setConflictSuggestion(null);
          }}
          onUseSuggestion={useSuggestion}
        />
      ) : null}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
