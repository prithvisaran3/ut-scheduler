import type { StepType } from "../lib/scheduleConfig";

export interface RejectedAttempt {
  slot_index: number;
  blocking_resource: string;
  offset: number;
}

export interface BookingSlot {
  slot_index: number;
  resource_type: StepType;
  resource_id?: string | null;
}

export interface BookingSearchResponse {
  pathway_id: string;
  date: string;
  earliest_start_slot: number | null;
  end_slot: number | null;
  feasible_starts: number[];
  rejected_attempts: RejectedAttempt[];
  slots: BookingSlot[];
  total_blocks: number;
}

export interface BookingSearchRequest {
  pathway_id: string;
  date: string;
}

export interface BookingCreateRequest {
  pathway_id: string;
  date: string;
  start_slot: number;
}

export interface Booking {
  id: string;
  patient_id: string;
  pathway_id: string;
  pathway_name?: string | null;
  date: string;
  start_slot: number;
  end_slot?: number | null;
  status: "confirmed" | "cancelled";
  created_at?: string | null;
  slots: BookingSlot[];
}
