import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary-strong text-white hover:bg-primary-hover disabled:bg-active disabled:text-primary-hover",
  secondary:
    "border border-page-border bg-white text-page-text hover:bg-brand-50 disabled:border-transparent disabled:bg-active disabled:text-primary-hover",
  ghost: "text-page-text hover:bg-brand-50 disabled:bg-active disabled:text-primary-hover",
  danger: "bg-danger text-white hover:bg-red-700 disabled:bg-red-100 disabled:text-red-800",
};

/** Shared classes so links that look like buttons get the same 48px target. */
export function buttonClasses(variant: Variant = "primary", className = ""): string {
  return (
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] " +
    "px-5 text-base font-medium transition-colors sm:w-auto " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
    "disabled:cursor-not-allowed " +
    VARIANTS[variant] +
    " " +
    className
  );
}

/** 48px target, visible focus ring and high-contrast disabled states without opacity. */
export function Button({ variant = "primary", className = "", children, ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      aria-disabled={rest.disabled || undefined}
      className={buttonClasses(variant, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
