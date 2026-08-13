import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as scheduleApi from "../api/scheduleApi";
import type { SlotPatchRequest } from "../types/schedule";

export function useSchedule(date: string) {
  return useQuery({
    queryKey: ["schedule", date],
    queryFn: () => scheduleApi.fetchSchedule(date),
    enabled: Boolean(date),
    // Cold starts on Render can take ~60s — give one extra retry with delay.
    retry: (count, err) => {
      if (err && typeof err === "object" && "status" in err) {
        const s = (err as { status: number }).status;
        if (s === 401 || s === 403) return false;
        if (s === 0) return count < 2;
      }
      return count < 1;
    },
    retryDelay: (attempt) => Math.min(5_000 * (attempt + 1), 20_000),
  });
}

export function usePatchSlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SlotPatchRequest) => scheduleApi.patchSlots(body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["schedule", vars.date] });
    },
  });
}
