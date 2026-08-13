import type { Transition, Variants } from "framer-motion";

const reduced =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const stencilFlightSpring: Transition = reduced
  ? { duration: 0 }
  : { type: "spring", stiffness: 320, damping: 30, mass: 0.8 };

export const ghostChipFade: Transition = reduced
  ? { duration: 0 }
  : { duration: 0.45, ease: "easeOut" };

export const stencilSearchVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: stencilFlightSpring },
  exit: { opacity: 0, transition: { duration: reduced ? 0 : 0.2 } },
};

export const chipVariants: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 0.4, x: 0, transition: ghostChipFade },
  fade: { opacity: 0, filter: "blur(0.4px)", transition: { duration: reduced ? 0 : 0.8 } },
};

export function stepDelay(index: number): number {
  return reduced ? 0 : index * 0.18;
}
