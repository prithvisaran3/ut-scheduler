import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as bookingApi from "../api/bookingApi";

export function useMyBookings() {
  return useQuery({
    queryKey: ["bookings", "mine"],
    queryFn: () => bookingApi.listMyBookings(),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (booking: { id: string; date: string }) =>
      bookingApi.cancelBooking(booking.id),
    onSuccess: (_data, booking) => {
      void qc.invalidateQueries({ queryKey: ["bookings", "mine"] });
      // Always the booking's date — the patient may be looking at a different day.
      void qc.invalidateQueries({ queryKey: ["schedule", booking.date] });
    },
  });
}
