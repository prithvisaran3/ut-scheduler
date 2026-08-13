import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as scheduleApi from "../api/scheduleApi";
import type { SlotPatchRequest } from "../types/schedule";

export function useSchedule(date: string) {
  return useQuery({
    queryKey: ["schedule", date],
    queryFn: () => scheduleApi.fetchSchedule(date),
    enabled: Boolean(date),
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
