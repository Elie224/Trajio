"use client";

import { RotateCw } from "lucide-react";

import { SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/errors";

type ServiceErrorProps = {
  /** Called by "Réessayer" (ignored when `submitForm` is set). */
  onRetry?: () => void;
  /** Inside a form: "Réessayer" re-submits it (keeps what the user typed). */
  submitForm?: boolean;
  message?: string;
  className?: string;
};

/** Shared "API unreachable / 5xx" block: role=alert, message + Réessayer. */
export function ServiceError({
  onRetry,
  submitForm = false,
  message = SERVICE_UNAVAILABLE_MESSAGE,
  className = "",
}: ServiceErrorProps) {
  return (
    <div
      role="alert"
      className={
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 " +
        className
      }
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type={submitForm ? "submit" : "button"}
        onClick={submitForm ? undefined : onRetry}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 font-medium text-red-800 underline underline-offset-2 hover:bg-red-100"
      >
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Réessayer
      </button>
    </div>
  );
}
