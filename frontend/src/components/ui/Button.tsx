import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-salmon-500)] text-[var(--color-white)] shadow-[var(--shadow-xs)] hover:bg-[var(--color-salmon-600)]",
  secondary:
    "bg-[var(--color-white)] text-[var(--color-navy-900)] border border-[var(--color-grey-200)] shadow-[var(--shadow-xs)]",
  ghost: "bg-transparent text-[var(--color-grey-500)] hover:text-[var(--color-navy-900)]",
  danger: "bg-[var(--color-salmon-700)] text-[var(--color-white)]",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: PropsWithChildren<Props>) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] px-[18px] text-[length:var(--text-14)] font-medium transition disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
