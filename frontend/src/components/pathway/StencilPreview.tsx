import type { CSSProperties } from "react";
import type { Pathway } from "../../types/pathway";
import type { StepType } from "../../lib/scheduleConfig";

export interface StencilStepLike {
  resource_type: string;
  duration_minutes: number;
  sequence_order?: number;
  id?: string;
}

/** Shared fill for every stencil bar in the app (cards, selector, builder lane). */
export function stencilSegmentStyle(resourceType: string): CSSProperties {
  if (resourceType === "gap") {
    return {
      backgroundColor: "var(--color-resource-gap-bg)",
      backgroundImage:
        "repeating-linear-gradient(45deg, var(--color-resource-gap-fg) 0 1px, transparent 1px 6px)",
    };
  }
  const color =
    resourceType === "doctor"
      ? "var(--color-resource-doctor)"
      : resourceType === "nmt"
        ? "var(--color-resource-nmt)"
        : resourceType === "scan"
          ? "var(--color-resource-scan)"
          : "var(--color-navy-700)";
  return { background: color };
}

export function stencilSwatchStyle(resourceType: StepType | string): CSSProperties {
  return stencilSegmentStyle(resourceType);
}

interface Props {
  steps?: StencilStepLike[];
  pathway?: Pathway;
  /** compact = card/sidebar bars; lane = builder assembly strip */
  variant?: "compact" | "lane";
  muted?: boolean;
}

/**
 * Proportional pathway stencil — single visual language for PathwayCard,
 * PathwaySelector, admin sidebar, and PathwayBuilderModal assembly lane.
 */
export function StencilPreview({
  steps,
  pathway,
  variant = "compact",
  muted = false,
}: Props) {
  const items = steps ?? pathway?.steps ?? [];
  const isLane = variant === "lane";

  return (
    <div
      className={`flex overflow-hidden ${
        isLane ? "h-14 gap-0.5 rounded-[var(--radius-md)]" : "h-2 gap-0.5 rounded-[var(--radius-sm)]"
      } ${muted ? "opacity-45" : ""}`}
    >
      {items.map((step, index) => (
        <div
          key={step.id ?? `${step.sequence_order ?? index}-${step.resource_type}`}
          className={
            isLane
              ? "flex flex-col items-center justify-center gap-0.5"
              : undefined
          }
          style={{
            flex: step.duration_minutes,
            ...stencilSegmentStyle(step.resource_type),
          }}
        />
      ))}
    </div>
  );
}
