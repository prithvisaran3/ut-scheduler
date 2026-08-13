import type { StepType } from "../lib/scheduleConfig";

export interface PathwayStep {
  id?: string;
  resource_type: StepType;
  duration_minutes: number;
  block_count: number;
  sequence_order: number;
}

export interface Pathway {
  id: string;
  name: string;
  created_by: string | null;
  created_at?: string | null;
  steps: PathwayStep[];
  total_blocks: number;
  total_minutes: number;
}

export interface PathwayCreate {
  name: string;
  steps: Omit<PathwayStep, "id">[];
}
