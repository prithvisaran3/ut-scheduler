import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { strings } from "../../content/strings";
import { SLOT_MINUTES, STEP_TYPES, type StepType } from "../../lib/scheduleConfig";
import { minutesToDurationLabel } from "../../lib/time";
import { useCreatePathway } from "../../hooks/usePathways";
import type { Pathway } from "../../types/pathway";
import { stencilSegmentStyle, stencilSwatchStyle } from "./StencilPreview";

const schema = z.object({
  name: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

interface StepDraft {
  id: string;
  resource_type: StepType;
  duration_minutes: number;
}

const END_DROP_ID = "__end_drop__";

function stepsFromPathway(pathway: Pathway): StepDraft[] {
  return [...pathway.steps]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((s) => ({
      id: crypto.randomUUID(),
      resource_type: s.resource_type,
      duration_minutes: s.duration_minutes,
    }));
}

function StepBlockContent({
  step,
  showRemove,
  onRemove,
}: {
  step: StepDraft;
  showRemove?: boolean;
  onRemove?: () => void;
}) {
  const isGap = step.resource_type === "gap";
  return (
    <>
      <span
        className={`font-medium ${isGap ? "text-[var(--color-grey-700)]" : "text-[var(--color-white)]"}`}
        style={{ fontSize: "var(--text-11)" }}
      >
        {strings.pathwayBuilder.short[step.resource_type]}
      </span>
      <span
        className={isGap ? "text-[var(--color-grey-500)]" : "text-[var(--color-navy-300)]"}
        style={{ fontSize: "var(--text-11)" }}
      >
        {strings.pathwayBuilder.durationShort(step.duration_minutes)}
      </span>
      {showRemove && onRemove ? (
        <button
          type="button"
          aria-label={strings.pathwayBuilder.removeStepAria}
          className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-white)]/90 text-[var(--color-grey-700)]"
          style={{ fontSize: 10 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </>
  );
}

function SortableStep({
  step,
  onRemove,
}: {
  step: StepDraft;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: step.duration_minutes,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        ...stencilSegmentStyle(step.resource_type),
      }}
      className="relative flex min-w-[40px] cursor-grab flex-col items-center justify-center gap-0.5 active:cursor-grabbing"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={onRemove}
      {...attributes}
      {...listeners}
    >
      {isDragging ? (
        <div className="absolute inset-0 border-2 border-dashed border-[var(--color-salmon-400)] bg-[var(--color-salmon-50)]/80" />
      ) : (
        <StepBlockContent step={step} showRemove={hover} onRemove={onRemove} />
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, opens pre-filled for edit. When omitted, "New pathway" starts empty. */
  pathway?: Pathway | null;
}

export function PathwayBuilderModal({ open, onClose, pathway = null }: Props) {
  const create = useCreatePathway();
  const [palette, setPalette] = useState<Record<StepType, number>>({
    doctor: 45,
    nmt: 30,
    gap: 60,
    scan: 60,
  });
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  // Reset every time the modal opens — empty for new, pathway steps for edit.
  useEffect(() => {
    if (!open) return;
    if (pathway) {
      setSteps(stepsFromPathway(pathway));
      reset({ name: pathway.name });
    } else {
      setSteps([]);
      reset({ name: "" });
    }
    setPalette({ doctor: 45, nmt: 30, gap: 60, scan: 60 });
    setActiveId(null);
  }, [open, pathway, reset]);

  const totals = useMemo(() => {
    const minutes = steps.reduce((s, x) => s + x.duration_minutes, 0);
    return { minutes, blocks: minutes / SLOT_MINUTES };
  }, [steps]);

  const activeStep = useMemo(
    () => steps.find((s) => s.id === activeId) ?? null,
    [steps, activeId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const bumpPalette = (type: StepType, delta: number) => {
    setPalette((prev) => ({
      ...prev,
      [type]: Math.max(SLOT_MINUTES, prev[type] + delta),
    }));
  };

  const addFromPalette = (type: StepType) => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        resource_type: type,
        duration_minutes: palette[type],
      },
    ]);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (over.id === END_DROP_ID) {
      setSteps((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        if (oldIndex < 0 || oldIndex === items.length - 1) return items;
        return arrayMove(items, oldIndex, items.length - 1);
      });
      return;
    }

    setSteps((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    setActiveId(null);
  };

  const onSubmit = handleSubmit(async (values) => {
    if (steps.length === 0) return;
    await create.mutateAsync({
      name: values.name,
      steps: steps.map((s, i) => ({
        resource_type: s.resource_type,
        duration_minutes: s.duration_minutes,
        block_count: s.duration_minutes / SLOT_MINUTES,
        sequence_order: i,
      })),
    });
    onClose();
  });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "var(--overlay-modal)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--color-white)] shadow-[var(--shadow-md)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 flex-none items-center justify-between border-b border-[var(--color-grey-200)] px-6">
              <h2
                className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
                style={{ fontSize: "var(--text-20)" }}
              >
                {strings.pathwayBuilder.title}
              </h2>
              <button
                type="button"
                aria-label={strings.pathwayBuilder.closeAria}
                onClick={onClose}
                className="relative h-7 w-7 rounded-[var(--radius-md)] border border-[var(--color-grey-200)]"
              >
                <span className="absolute top-1/2 left-1/2 block h-[1.5px] w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[var(--color-grey-500)]" />
                <span className="absolute top-1/2 left-1/2 block h-[1.5px] w-2.5 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[var(--color-grey-500)]" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col">
              <div className="flex flex-col gap-6 p-6">
                <label className="flex flex-col gap-1.5">
                  <span
                    className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                    style={{ fontSize: "var(--text-12)" }}
                  >
                    {strings.pathwayBuilder.nameLabel}
                  </span>
                  <input
                    className="h-10 rounded-[var(--radius-md)] border border-[var(--color-grey-300)] bg-[var(--color-white)] px-3 text-[var(--color-ink)] shadow-[var(--shadow-xs)] outline-none focus:border-[var(--color-navy-600)]"
                    style={{ fontSize: "var(--text-14)" }}
                    placeholder={strings.pathwayBuilder.namePlaceholder}
                    {...register("name")}
                  />
                  {errors.name ? (
                    <span
                      className="text-[var(--color-salmon-700)]"
                      style={{ fontSize: "var(--text-12)" }}
                    >
                      {errors.name.message}
                    </span>
                  ) : null}
                </label>

                {/* ZONE 1 — palette: stepper ≠ add */}
                <div className="flex flex-col gap-2.5">
                  <div
                    className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                    style={{ fontSize: "var(--text-12)" }}
                  >
                    {strings.pathwayBuilder.blocks}
                  </div>
                  <div className="flex gap-2.5">
                    {STEP_TYPES.map((type) => (
                      <div
                        key={type}
                        className="flex w-[100px] flex-1 flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-3.5 w-3.5 shrink-0 ${
                              type === "doctor"
                                ? "rounded-full"
                                : type === "scan"
                                  ? "rotate-45"
                                  : "rounded-[var(--radius-sm)]"
                            }`}
                            style={stencilSwatchStyle(type)}
                          />
                          <span
                            className="font-medium text-[var(--color-navy-900)]"
                            style={{ fontSize: "var(--text-13)" }}
                          >
                            {strings.grid[type]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-grey-50)] px-2 py-1.5">
                          <button
                            type="button"
                            className="font-medium text-[var(--color-grey-500)]"
                            style={{ fontSize: "var(--text-12)" }}
                            onClick={() => bumpPalette(type, -SLOT_MINUTES)}
                          >
                            −
                          </button>
                          <span
                            className="font-medium text-[var(--color-ink)]"
                            style={{ fontSize: "var(--text-12)" }}
                          >
                            {strings.pathwayBuilder.durationMin(palette[type])}
                          </span>
                          <button
                            type="button"
                            className="font-medium text-[var(--color-grey-500)]"
                            style={{ fontSize: "var(--text-12)" }}
                            onClick={() => bumpPalette(type, SLOT_MINUTES)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => addFromPalette(type)}
                          className="rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] py-1.5 font-medium text-[var(--color-navy-900)] hover:border-[var(--color-salmon-400)] hover:text-[var(--color-salmon-700)]"
                          style={{ fontSize: "var(--text-12)" }}
                        >
                          {strings.pathwayBuilder.add}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ZONE 2 — dnd-kit assembly lane */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between">
                    <div
                      className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                      style={{ fontSize: "var(--text-12)" }}
                    >
                      {strings.pathwayBuilder.sequence}
                    </div>
                    <div
                      className="text-[var(--color-grey-500)]"
                      style={{ fontSize: "var(--text-12)" }}
                    >
                      {strings.pathwayBuilder.dragReorder}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-grey-300)] bg-[var(--color-grey-50)] p-3">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      onDragCancel={() => setActiveId(null)}
                    >
                      <SortableContext
                        items={steps.map((s) => s.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div
                          className="flex h-14 overflow-hidden rounded-[var(--radius-sm)]"
                          style={{ gap: 2 }}
                        >
                          {steps.length === 0 ? (
                            <div
                              className="flex flex-1 items-center justify-center text-[var(--color-grey-500)]"
                              style={{ fontSize: "var(--text-12)" }}
                            >
                              {strings.pathwayBuilder.emptyLane}
                            </div>
                          ) : (
                            <>
                              {steps.map((step) => (
                                <SortableStep
                                  key={step.id}
                                  step={step}
                                  onRemove={() =>
                                    setSteps((prev) => prev.filter((s) => s.id !== step.id))
                                  }
                                />
                              ))}
                              <EndDropZone />
                            </>
                          )}
                        </div>
                      </SortableContext>

                      <DragOverlay dropAnimation={null}>
                        {activeStep ? (
                          <div
                            className="flex h-14 min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)]"
                            style={{
                              width: Math.max(48, activeStep.duration_minutes * 0.6),
                              ...stencilSegmentStyle(activeStep.resource_type),
                            }}
                          >
                            <StepBlockContent step={activeStep} />
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>

                    <div className="mt-2 flex justify-between">
                      <span
                        className="font-medium text-[var(--color-grey-500)]"
                        style={{ fontSize: "var(--text-11)" }}
                      >
                        {strings.pathwayBuilder.start}
                      </span>
                      <span
                        className="font-medium text-[var(--color-grey-500)]"
                        style={{ fontSize: "var(--text-11)" }}
                      >
                        {totals.minutes > 0
                          ? `+${minutesToDurationLabel(totals.minutes)}`
                          : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex h-[72px] flex-none items-center justify-between border-t border-[var(--color-grey-200)] bg-[var(--color-grey-50)] px-6">
                <div
                  className="font-medium text-[var(--color-grey-700)]"
                  style={{ fontSize: "var(--text-13)" }}
                >
                  {strings.pathwayBuilder.total(
                    totals.blocks,
                    minutesToDurationLabel(totals.minutes || 0),
                  )}
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] px-4 font-medium text-[var(--color-grey-700)]"
                    style={{ fontSize: "var(--text-14)" }}
                  >
                    {strings.pathwayBuilder.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={create.isPending || steps.length === 0}
                    className="flex h-10 items-center rounded-[var(--radius-md)] bg-[var(--color-salmon-500)] px-[18px] font-medium text-[var(--color-white)] shadow-[var(--shadow-xs)] disabled:opacity-50"
                    style={{ fontSize: "var(--text-14)" }}
                  >
                    {strings.pathwayBuilder.save}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function EndDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: END_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-[28px] flex-none self-stretch rounded-[var(--radius-sm)] transition ${
        isOver
          ? "border-2 border-dashed border-[var(--color-salmon-500)] bg-[var(--color-salmon-50)]"
          : "border border-dashed border-[var(--color-grey-200)]/0"
      }`}
      aria-hidden
    />
  );
}
