import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-brand-50 text-page-text ring-page-border",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-danger ring-rose-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 " +
        TONES[tone]
      }
    >
      {children}
    </span>
  );
}
