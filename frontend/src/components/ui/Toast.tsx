import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

/** Brief non-blocking feedback — bottom-center toast. */
export function Toast({ message, onDismiss, durationMs = 2800 }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
        >
          <div
            className="rounded-[var(--radius-md)] bg-[var(--color-navy-900)] px-4 py-2.5 text-[length:var(--text-13)] font-medium text-[var(--color-white)] shadow-[var(--shadow-md)]"
            role="status"
          >
            {message}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
