import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300",
  secondary:
    "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-500",
  ghost: "text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-500",
};

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium " +
        "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
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
