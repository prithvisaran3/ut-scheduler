import { apiFetch } from "./client";
import type { ScheduleDay, SlotPatchRequest } from "../types/schedule";

export function fetchSchedule(date: string) {
  return apiFetch<ScheduleDay>(`/schedule?date=${encodeURIComponent(date)}`);
}

export function patchSlots(body: SlotPatchRequest) {
  return apiFetch<{ changed: number }>("/schedule/slots", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
