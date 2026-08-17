import { create } from "zustand";
import { CLINIC_TIMEZONE } from "../lib/scheduleConfig";
import { clinicDateString } from "../lib/time";

interface ScheduleUiState {
  selectedDate: string;
  selectedPathwayId: string | null;
  setSelectedDate: (date: string) => void;
  setSelectedPathwayId: (id: string | null) => void;
}

export const useScheduleStore = create<ScheduleUiState>((set) => ({
  // The clinic's day, not the browser's — a patient abroad still lands on today.
  selectedDate: clinicDateString(Date.now(), CLINIC_TIMEZONE),
  selectedPathwayId: null,
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedPathwayId: (selectedPathwayId) => set({ selectedPathwayId }),
}));
