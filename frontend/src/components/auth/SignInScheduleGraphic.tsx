/**
 * Abstract schedule line-graphic from Frame 01 (design-reference).
 * Thin Navy 700/600 horizontals with Salmon 500 blocks along them.
 * All colors/radii/shadows via tokens.css.
 */
export function SignInScheduleGraphic() {
  return (
    <div
      className="relative flex w-full max-w-[520px] flex-col"
      style={{ height: 217, gap: 23 }}
      aria-hidden
    >
      <div className="h-px bg-[var(--color-navy-700)]" />
      <div className="h-px bg-[var(--color-navy-600)] opacity-45" />
      <div className="h-px bg-[var(--color-navy-700)] opacity-85" />
      <div className="h-px bg-[var(--color-navy-600)] opacity-35" />
      <div className="h-px bg-[var(--color-navy-700)]" />
      <div className="h-px bg-[var(--color-navy-600)] opacity-50" />
      <div className="h-px bg-[var(--color-navy-700)] opacity-70" />
      <div className="h-px bg-[var(--color-navy-600)] opacity-30" />
      <div className="h-px bg-[var(--color-navy-700)] opacity-90" />

      {/* Salmon placement blocks */}
      <div
        className="absolute rounded-[var(--radius-block)] bg-[var(--color-salmon-500)] shadow-[var(--shadow-glow-salmon)]"
        style={{ left: 64, top: 31, width: 132, height: 10 }}
      />
      <div
        className="absolute rounded-[var(--radius-block)] bg-[var(--color-salmon-500)] shadow-[var(--shadow-glow-salmon)]"
        style={{ left: 232, top: 127, width: 96, height: 10 }}
      />
      <div
        className="absolute rounded-[var(--radius-block)] bg-[var(--color-salmon-500)] opacity-75 shadow-[var(--shadow-glow-salmon)]"
        style={{ left: 352, top: 175, width: 64, height: 10 }}
      />

      {/* Soft navy occupancy ghosts */}
      <div
        className="absolute rounded-[var(--radius-block)] bg-[var(--color-navy-600)] opacity-35"
        style={{ left: 64, top: 79, width: 180, height: 10 }}
      />
      <div
        className="absolute rounded-[var(--radius-block)] bg-[var(--color-navy-600)] opacity-20"
        style={{ left: 280, top: 79, width: 88, height: 10 }}
      />
    </div>
  );
}
