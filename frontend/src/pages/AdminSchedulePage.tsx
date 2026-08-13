import { useMemo, useState } from "react";
import { ScheduleGrid } from "../components/grid/ScheduleGrid";
import { DateStrip } from "../components/common/DateStrip";
import { PathwayBuilderModal } from "../components/pathway/PathwayBuilderModal";
import { StencilPreview } from "../components/pathway/StencilPreview";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { UserAvatarMenu } from "../components/ui/UserAvatarMenu";
import { strings } from "../content/strings";
import { usePathways, useDeletePathway } from "../hooks/usePathways";
import { usePatchSlots, useSchedule } from "../hooks/useSchedule";
import { useLogout } from "../hooks/useAuth";
import { useScheduleStore } from "../store/scheduleStore";
import { useAuthStore } from "../store/authStore";
import { minutesToDurationLabel, slotIndexToLabel } from "../lib/time";
import { ApiError } from "../api/client";
import type { ScheduleDay } from "../types/schedule";

function utilizationPercent(schedule: ScheduleDay): number {
  const cols = schedule.columns.filter(
    (c) =>
      c.resource_type === "doctor" ||
      c.resource_type === "nmt" ||
      c.resource_type === "scan",
  );
  let total = 0;
  let used = 0;
  for (const col of cols) {
    for (const slot of col.slots) {
      total += 1;
      if (slot.blocked || slot.occupied > 0) used += 1;
    }
  }
  return total === 0 ? 0 : Math.round((used / total) * 100);
}

function downloadScheduleCsv(schedule: ScheduleDay, date: string) {
  const headers = [
    "slot_index",
    "time",
    "resource_type",
    "occupied",
    "capacity",
    "blocked",
    "free",
  ];
  const rows: string[] = [headers.join(",")];
  for (const col of schedule.columns) {
    for (const slot of col.slots) {
      rows.push(
        [
          slot.slot_index,
          slotIndexToLabel(slot.slot_index),
          col.resource_type,
          slot.occupied,
          slot.capacity,
          slot.blocked,
          slot.free,
        ].join(","),
      );
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ut-schedule-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminSchedulePage() {
  const fullName = useAuthStore((s) => s.fullName);
  const logout = useLogout();
  const { selectedDate, setSelectedDate } = useScheduleStore();
  const schedule = useSchedule(selectedDate);
  const pathways = usePathways();
  const deletePathway = useDeletePathway();
  const patchSlots = usePatchSlots();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const utilized = useMemo(
    () => (schedule.data ? utilizationPercent(schedule.data) : 0),
    [schedule.data],
  );
  const activeCount = pathways.data?.length ?? 0;

  return (
    <div className="flex h-screen flex-col bg-[var(--color-white)]">
      <header className="flex h-[72px] flex-none items-center justify-between border-b border-[var(--color-grey-200)] bg-[var(--color-white)] px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <h1
            className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
            style={{ fontSize: "var(--text-20)" }}
          >
            {strings.admin.title}
          </h1>
          <DateStrip selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="rounded-[var(--radius-md)] bg-[var(--color-grey-100)] px-3 py-[7px] font-medium text-[var(--color-grey-700)]"
            style={{ fontSize: "var(--text-12)" }}
          >
            {strings.admin.utilizedToday(utilized)}
          </div>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--color-grey-200)] px-3 py-[7px] font-medium text-[var(--color-grey-700)] disabled:opacity-50"
            style={{ fontSize: "var(--text-12)" }}
            disabled={!schedule.data}
            onClick={() => {
              if (!schedule.data) return;
              downloadScheduleCsv(schedule.data, selectedDate);
              setExportNote(strings.admin.exportDone);
              window.setTimeout(() => setExportNote(null), 2500);
            }}
          >
            {exportNote ?? strings.admin.export}
          </button>
          <UserAvatarMenu
            fullName={fullName}
            roleLabel={strings.common.admin}
            onLogout={logout}
            logoutLabel={strings.admin.logout}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col px-6 pt-5">
          {schedule.data ? (
            <ScheduleGrid
              schedule={schedule.data}
              mode="admin"
              selectedDate={selectedDate}
              onToggleSlots={({ resource_type, slot_indices, blocked }) => {
                patchSlots.mutate(
                  {
                    date: selectedDate,
                    resource_type,
                    slot_indices,
                    blocked,
                  },
                  {
                    onError: (err) => {
                      setToast(
                        err instanceof ApiError
                          ? err.message
                          : strings.admin.blockOccupiedError,
                      );
                    },
                  },
                );
              }}
            />
          ) : schedule.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--color-grey-700)]">
              <p>{strings.patient.loadError}</p>
              <Button type="button" variant="secondary" onClick={() => void schedule.refetch()}>
                {strings.patient.retry}
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--color-grey-500)]">
              {strings.common.loading}
            </div>
          )}
        </div>

        <aside className="flex w-[340px] flex-none flex-col gap-3 border-l border-[var(--color-grey-200)] bg-[var(--color-grey-50)] p-5">
          <div className="flex items-baseline justify-between">
            <div
              className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
              style={{ fontSize: "var(--text-20)" }}
            >
              {strings.admin.pathways}
            </div>
            <div
              className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-500)]"
              style={{ fontSize: "var(--text-11)" }}
            >
              {strings.admin.activeCount(activeCount)}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto">
            {pathways.data?.length ? (
              pathways.data.map((p) => (
                <div
                  key={p.id}
                  className="group relative rounded-[var(--radius-xl)] border border-[var(--color-grey-200)] bg-[var(--color-white)] p-3.5 shadow-[var(--shadow-xs)]"
                >
                  <button
                    type="button"
                    className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-grey-300)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--color-grey-100)] hover:text-[var(--color-salmon-700)]"
                    aria-label={strings.admin.deletePathway}
                    disabled={deletePathway.isPending}
                    onClick={() => {
                      if (!window.confirm(strings.admin.deletePathwayConfirm(p.name))) return;
                      deletePathway.mutate(p.id);
                    }}
                  >
                    ×
                  </button>
                  <div
                    className="pr-7 font-semibold text-[var(--color-navy-900)]"
                    style={{ fontSize: "var(--text-14)", lineHeight: 1.2 }}
                  >
                    {p.name}
                  </div>
                  <div
                    className="mt-1 mb-2.5 text-[var(--color-grey-500)]"
                    style={{ fontSize: "var(--text-12)", lineHeight: 1.4 }}
                  >
                    {strings.patient.blocksDuration(
                      p.total_blocks,
                      minutesToDurationLabel(p.total_minutes),
                    )}
                  </div>
                  <StencilPreview pathway={p} />
                </div>
              ))
            ) : (
              <div
                className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-grey-300)] bg-[var(--color-white)] px-3.5 py-6 text-center text-[var(--color-grey-500)]"
                style={{ fontSize: "var(--text-13)", lineHeight: 1.4 }}
              >
                {strings.admin.noPathwaysSidebar}
              </div>
            )}
          </div>

          <Button className="mt-auto w-full" onClick={() => setBuilderOpen(true)}>
            {strings.admin.newPathway}
          </Button>
        </aside>
      </div>

      <PathwayBuilderModal open={builderOpen} onClose={() => setBuilderOpen(false)} />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
