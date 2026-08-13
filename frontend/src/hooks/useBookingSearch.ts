import { useMutation } from "@tanstack/react-query";
import * as bookingApi from "../api/bookingApi";
import type { BookingSearchRequest } from "../types/booking";

export function useBookingSearch() {
  return useMutation({
    mutationFn: (body: BookingSearchRequest) => bookingApi.searchBooking(body),
  });
}
