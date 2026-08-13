import { apiFetch } from "./client";
import type {
  Booking,
  BookingCreateRequest,
  BookingSearchRequest,
  BookingSearchResponse,
} from "../types/booking";

export function searchBooking(body: BookingSearchRequest) {
  return apiFetch<BookingSearchResponse>("/bookings/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function confirmBooking(body: BookingCreateRequest) {
  return apiFetch<Booking>("/bookings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMyBookings() {
  return apiFetch<Booking[]>("/bookings/mine");
}

export function cancelBooking(id: string) {
  return apiFetch<void>(`/bookings/${id}`, { method: "DELETE" });
}
