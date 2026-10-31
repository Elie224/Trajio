"use client";

import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/Card";

import type { AdminKpi } from "@/features/admin/admin-metrics";

/**
 * The KPI row of the dashboard.
 *
 * A tile with an alert value (pending work) is flagged with a warning border
 * so an administrator sees the backlog without reading every number.
 *
 * The alert is not carried by colour alone: it also shows an icon and the
 * "à traiter" wording, so it stays readable for a colour-blind user and in
 * forced-colours mode.
 */
export function AdminStatsTiles({ kpis }: { kpis: AdminKpi[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <li key={kpi.key}>
          <Card
            className={
              kpi.isAlert
                ? "border-amber-300 bg-amber-50/60 ring-1 ring-amber-300"
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-5 text-page-muted">{kpi.label}</p>
              {kpi.isAlert && (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
              )}
            </div>
            <p
              className={
                "mt-1 font-heading text-2xl font-semibold " +
                (kpi.isAlert ? "text-amber-900" : "text-page-text")
              }
            >
              {kpi.value}
            </p>
            {kpi.isAlert && <p className="sr-only">à traiter</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
