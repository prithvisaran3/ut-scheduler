import { useEffect, useRef, useState } from "react";
import { strings } from "../../content/strings";

function initialsFromName(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface Props {
  fullName: string | null;
  roleLabel: string;
  onLogout: () => void;
  logoutLabel?: string;
}

export function UserAvatarMenu({
  fullName,
  roleLabel,
  onLogout,
  logoutLabel = strings.patient.logout,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative flex items-center gap-3" ref={rootRef}>
      <div
        className="rounded-[var(--radius-md)] bg-[var(--color-grey-100)] px-2.5 py-1.5 font-medium text-[var(--color-grey-700)]"
        style={{ fontSize: "var(--text-11)" }}
      >
        {roleLabel}
      </div>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-3xl)] bg-[var(--color-navy-800)] font-medium text-[var(--color-white)]"
        style={{ fontSize: "var(--text-12)" }}
      >
        {initialsFromName(fullName)}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] shadow-[var(--shadow-sm)]"
        >
          <div
            className="border-b border-[var(--color-grey-200)] px-3 py-2 text-[var(--color-grey-500)]"
            style={{ fontSize: "var(--text-12)" }}
          >
            {fullName}
          </div>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left font-medium text-[var(--color-salmon-700)] hover:bg-[var(--color-grey-50)]"
            style={{ fontSize: "var(--text-13)" }}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            {logoutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
