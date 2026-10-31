"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ServiceError } from "@/components/ui/ServiceError";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { SessionStatus } from "@/features/auth/SessionStatus";
import { useSession } from "@/features/auth/useSession";
import { AdminReportsPanel } from "@/features/admin/AdminReportsPanel";
import { AdminStatsTiles } from "@/features/admin/AdminStatsTiles";
import { AdminUsersPanel } from "@/features/admin/AdminUsersPanel";
import { buildKpis, type AdminKpi } from "@/features/admin/admin-metrics";
import { userFacingError } from "@/lib/errors";
import { fetchAdminStats, type AdminStats } from "@/lib/api";

type Tab = "overview" | "users" | "reports";

/**
 * Tab labels.
 *
 * `short` is used below the `sm` breakpoint so the three tabs stay on one
 * line on a phone; `label` is the full wording, used from `sm` up and
 * exposed to assistive technology as the accessible name.
 */
const TABS = [
  { id: "overview" as const, label: "Vue d'ensemble", short: "Aperçu" },
  { id: "users" as const, label: "Utilisateurs", short: "Comptes" },
  { id: "reports" as const, label: "Signalements", short: "Signaux" },
];

const ID_PREFIX = "admin";

/**
 * Administration dashboard.
 *
 * Two guards: the session must be authenticated, and the account must hold
 * the `admin` role. A non-admin never sees the data: the panels only mount
 * once the role check passed, so no request is sent on their behalf.
 */
export function AdminDashboard() {
  const session = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [kpis, setKpis] = useState<AdminKpi[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  // The first load starts with the panel in its loading state; a reload
  // triggered by an action flips it back through `refreshStats`.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped to reload the statistics; also drives the "actualisé" indicator.
  const [reloadKey, setReloadKey] = useState(0);

  const isAdmin = session.status === "authenticated" && session.user.role === "admin";

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    const payload = await fetchAdminStats(signal);
    setStats(payload);
    setKpis(buildKpis(payload));
    setError(null);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    // The fetch is started from an async callback so that no state update
    // happens synchronously in the effect body (which would trigger a
    // cascading render). The first `await` inside `loadStats` already
    // defers every `setState` to a later tick.
    const start = async () => {
      try {
        await loadStats(controller.signal);
      } catch (err: unknown) {
        setError(userFacingError(err, "Impossible de charger les statistiques."));
      } finally {
        setLoading(false);
      }
    };
    void start();
    return () => controller.abort();
  }, [isAdmin, reloadKey, loadStats]);

  /**
   * The statistics are reloaded after a moderation action so the KPI tiles
   * never show a stale backlog. `AdminUsersPanel` and `AdminReportsPanel`
   * call this through the `onChanged` prop.
   */
  const refreshStats = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  if (session.status !== "authenticated") {
    return (
      <SessionStatus
        session={session}
        loadingLabel="Chargement du tableau de bord."
        anonymousBody="Connectez-vous avec un compte administrateur pour accéder à cette page."
      />
    );
  }

  if (!isAdmin) {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Accès réservé</CardTitle>
            <p className="mt-2 text-sm leading-6 text-page-muted">
              Cette page est réservée aux administrateurs Trajio.
            </p>
          </Card>
        </Container>
      </section>
    );
  }

  const pendingReports = stats?.open_reports ?? 0;
  const pendingUsers = stats?.users_pending ?? 0;

  return (
    <section className="page-section">
      <Container>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-page-text sm:text-3xl">
              Tableau de bord admin
            </h1>
            <p className="mt-2 text-sm text-page-muted">
              Activité de la plateforme, modération des comptes et traitement des signalements.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshStats}
            disabled={loading}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-page-border bg-white px-3 text-sm font-medium text-page-text transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:bg-active"
          >
            <RefreshCw
              className={"h-4 w-4 " + (loading ? "animate-spin" : "")}
              aria-hidden="true"
            />
            Actualiser
          </button>
        </div>

        <Tabs
          items={TABS.map((item) => ({
            ...item,
            badge:
              item.id === "reports"
                ? pendingReports
                : item.id === "users"
                  ? pendingUsers
                  : undefined,
          }))}
          activeId={tab}
          onChange={(id) => setTab(id as Tab)}
          idPrefix={ID_PREFIX}
          label="Sections du tableau de bord"
          className="mb-5"
        />

        <TabPanel idPrefix={ID_PREFIX} tabId="overview" active={tab === "overview"}>
          {loading && !stats && (
            <p className="text-sm text-page-muted" role="status">
              Chargement des statistiques.
            </p>
          )}
          {error && (
            <ServiceError
              message={error}
              onRetry={() => {
                setError(null);
                refreshStats();
              }}
            />
          )}
          {!error && stats && <AdminStatsTiles kpis={kpis} />}
          {!error && stats && (
            <p className="mt-4 text-sm text-page-muted">
              {stats.trips_scheduled} trajet(s) à venir, {stats.users_active} compte(s) actif(s).
            </p>
          )}
        </TabPanel>

        <TabPanel idPrefix={ID_PREFIX} tabId="users" active={tab === "users"}>
          <AdminUsersPanel onChanged={refreshStats} />
        </TabPanel>

        <TabPanel idPrefix={ID_PREFIX} tabId="reports" active={tab === "reports"}>
          <AdminReportsPanel onChanged={refreshStats} />
        </TabPanel>
      </Container>
    </section>
  );
}
