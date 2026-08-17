import type { CapacityResourceType } from "../lib/scheduleConfig";

export interface Occupant {
  booking_id: string;
  patient_name?: string | null;
  pathway_name?: string | null;
}

export interface ResourceSlot {
  slot_index: number;
  occupied: number;
  capacity: number;
  blocked: boolean;
  free: boolean;
  occupants: Occupant[];
  /** Patient-column uptake/gap segment — resources free, patient still present. */
  is_uptake?: boolean;
}

export interface ResourceColumn {
  resource_id: string | null;
  resource_type: string;
  name: string | null;
  capacity: number;
  slots: ResourceSlot[];
}

export interface ScheduleDay {
  date: string;
  day_start_hour: number;
  day_end_hour: number;
  slot_minutes: number;
  slots_per_day: number;
  columns: ResourceColumn[];
  /** IANA zone the clinic operates in — slot indices are offsets in this zone. */
  clinic_timezone: string;
  /** Server's current time, ISO-8601 with offset. The authority for the now-line. */
  clinic_now: string;
  clinic_today: string;
  current_slot_index: number;
}

export interface SlotPatchRequest {
  date: string;
  resource_type: CapacityResourceType;
  slot_indices: number[];
  blocked: boolean;
}
