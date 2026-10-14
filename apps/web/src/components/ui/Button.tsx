import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary-strong text-white hover:bg-primary-hover disabled:bg-primary-strong/40",
  secondary:
    "border border-page-border bg-white text-page-text hover:bg-brand-50 disabled:text-page-muted",
  ghost: "text-page-text hover:bg-brand-50",
  danger: "bg-danger text-white hover:bg-red-700 disabled:bg-danger/40",
};

/** 48px high, radius 12, full width on mobile, visible primary focus ring. */
export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      className={
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] " +
        "px-5 text-base font-medium transition-colors sm:w-auto " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
        "disabled:cursor-not-allowed " +
        VARIANTS[variant] +
        " " +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}
