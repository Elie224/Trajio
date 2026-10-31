"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { ServiceError } from "@/components/ui/ServiceError";
import {
  availableReportActions,
  buildActionOutcome,
  reportReasonLabel,
  reportStatusLabel,
} from "@/features/admin/admin-metrics";
import { userFacingError } from "@/lib/errors";
import {
  fetchAdminReports,
  updateAdminReportStatus,
  type AdminReport,
  type AdminReportStatus,
} from "@/lib/api";

const PAGE_SIZE = 20;

const STATUS_FILTERS: ReadonlyArray<{ value: AdminReportStatus | ""; label: string }> = [
  { value: "", label: "Tous" },
  { value: "open", label: "Ouverts" },
  { value: "reviewing", label: "En cours" },
  { value: "resolved", label: "Résolus" },
  { value: "dismissed", label: "Classés sans suite" },
];

function statusTone(status: AdminReportStatus): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "open":
      return "danger";
    case "reviewing":
      return "warning";
    case "resolved":
      return "success";
    default:
      return "neutral";
  }
}

function actionLabel(status: AdminReportStatus): string {
  if (status === "reviewing") return "Prendre en charge";
  if (status === "resolved") return "Résoudre";
  return "Classer sans suite";
}

/**
 * Moderation queue: the reported users an administrator has to act on.
 *
 * The report content is displayed as text only; nothing here renders the
 * reporter's identity as a link.
 */
export function AdminReportsPanel({
  onChanged,
  active = true,
}: {
  onChanged?: () => void;
  /** False while the panel is hidden: no request is sent until it is shown. */
  active?: boolean;
}) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AdminReportStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Failure of an action itself, kept apart from the success notice. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  // Bumped to force a reload of the current page (used by "Réessayer").
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // The panel stays mounted when its tab is hidden, but it must not query
    // the API: only the visible tab is allowed to spend the read quota.
    if (!active) return;
    let cancelled = false;
    void fetchAdminReports({
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((response) => {
        if (cancelled) return;
        setReports(response.items);
        setTotal(response.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(userFacingError(err, "Impossible de charger les signalements."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, statusFilter, offset, reloadKey]);

  async function reload() {
    const response = await fetchAdminReports({
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setReports(response.items);
    setTotal(response.total);
  }

  /**
   * Runs a moderation decision, then refreshes the list.
   *
   * The two failures are reported apart: if the decision was applied but the
   * reload failed, the administrator must not be told the decision failed.
   */
  async function runAction(
    action: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) {
    setNotice(null);
    setActionError(null);
    let actionError: string | null = null;
    try {
      await action();
    } catch (err: unknown) {
      actionError = userFacingError(err, failureMessage);
    }
    let refreshError: string | null = null;
    if (actionError === null) {
      try {
        await reload();
        onChanged?.();
      } catch (err: unknown) {
        // The decision went through; only the list refresh failed.
        refreshError = userFacingError(err, "Rechargez la page pour voir l'état à jour.");
      }
    }
    const outcome = buildActionOutcome({ successNotice: successMessage, actionError, refreshError });
    if (outcome.kind === "success") setNotice(outcome.notice);
    else setActionError(outcome.message);
  }

  async function changeStatus(report: AdminReport, status: AdminReportStatus) {
    setPendingReportId(report.id);
    await runAction(
      () => updateAdminReportStatus(report.id, status),
      `Signalement ${reportStatusLabel(status).toLowerCase()}.`,
      "La mise à jour du signalement a échoué.",
    );
    setPendingReportId(null);
  }

  const canGoBack = offset > 0;
  const canGoForward = offset + PAGE_SIZE < total;

  return (
    <Card>
      <CardTitle>Signalements</CardTitle>

      <div className="mt-3 grid max-w-xs gap-1 text-sm text-page-muted">
        <label htmlFor="admin-report-status">Statut</label>
        <select
          id="admin-report-status"
          value={statusFilter}
          onChange={(event) => {
            setOffset(0);
            setStatusFilter(event.target.value as AdminReportStatus | "");
            setLoading(true);
          }}
          className="field !min-h-11"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-3 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {actionError}
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="mt-3 rounded-[var(--radius-control)] bg-brand-50 px-3 py-2 text-sm text-page-text"
        >
          {notice}
        </p>
      )}

      {error && (
        <ServiceError
          className="mt-3"
          message={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            setReloadKey((key) => key + 1);
          }}
        />
      )}

      {loading ? (
        <p className="mt-4 text-sm text-page-muted" role="status">
          Chargement des signalements.
        </p>
      ) : reports.length === 0 ? (
        <p className="mt-4 text-sm text-page-muted">Aucun signalement dans cette file.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-[var(--radius-control)] border border-page-border p-3"
              aria-busy={pendingReportId === report.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">{reportReasonLabel(report.reason)}</Badge>
                <Badge tone={statusTone(report.status)}>{reportStatusLabel(report.status)}</Badge>
                <span className="text-xs text-page-muted">
                  {new Date(report.created_at).toLocaleString("fr-FR")}
                </span>
              </div>
              {report.details && (
                <p className="mt-2 text-sm leading-6 text-page-text">{report.details}</p>
              )}
              {availableReportActions(report).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableReportActions(report).map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={status === "resolved" ? "primary" : "secondary"}
                      disabled={pendingReportId === report.id}
                      onClick={() => void changeStatus(report, status)}
                      className="!w-auto !min-h-11 !px-3 !text-sm"
                    >
                      {actionLabel(status)}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-page-muted">
        <span>
          {total === 0
            ? "0 résultat"
            : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} sur ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canGoBack || loading}
            onClick={() => {
              setLoading(true);
              setOffset((value) => Math.max(0, value - PAGE_SIZE));
            }}
            className="!w-auto !min-h-11 !px-3 !text-sm"
          >
            Précédent
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canGoForward || loading}
            onClick={() => {
              setLoading(true);
              setOffset((value) => value + PAGE_SIZE);
            }}
            className="!w-auto !min-h-11 !px-3 !text-sm"
          >
            Suivant
          </Button>
        </div>
      </div>
    </Card>
  );
}
