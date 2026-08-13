import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as bookingApi from "../api/bookingApi";
import type { BookingCreateRequest } from "../types/booking";

export function useConfirmBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingCreateRequest) => bookingApi.confirmBooking(body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["schedule", vars.date] });
      void qc.invalidateQueries({ queryKey: ["bookings", "mine"] });
    },
  });
}
