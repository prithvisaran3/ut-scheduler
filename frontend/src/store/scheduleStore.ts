import { create } from "zustand";
import { format } from "date-fns";

interface ScheduleUiState {
  selectedDate: string;
  selectedPathwayId: string | null;
  setSelectedDate: (date: string) => void;
  setSelectedPathwayId: (id: string | null) => void;
}

export const useScheduleStore = create<ScheduleUiState>((set) => ({
  selectedDate: format(new Date(), "yyyy-MM-dd"),
  selectedPathwayId: null,
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedPathwayId: (selectedPathwayId) => set({ selectedPathwayId }),
}));
