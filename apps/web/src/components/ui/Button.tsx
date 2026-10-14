import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary-strong text-white hover:bg-primary-hover",
  secondary:
    "border border-page-border bg-white text-page-text hover:bg-brand-50",
  ghost: "text-page-text hover:bg-brand-50",
  danger: "bg-danger text-white hover:bg-red-700",
};

/** 48px high, radius 12, full width on mobile, visible primary focus ring.
 * Disabled: same colours at 60% opacity so the label stays readable. */
export function Button({ variant = "primary", className = "", children, ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      className={
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] " +
        "px-5 text-base font-medium transition-colors sm:w-auto " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
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
