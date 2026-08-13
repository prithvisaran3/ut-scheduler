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
}

export interface SlotPatchRequest {
  date: string;
  resource_type: "doctor" | "nmt" | "scan";
  slot_indices: number[];
  blocked: boolean;
}
