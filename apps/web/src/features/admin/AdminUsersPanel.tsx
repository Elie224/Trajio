"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { ServiceError } from "@/components/ui/ServiceError";
import {
  availableIdentityActions,
  availableStatusActions,
  needsIdentityReview,
  userStatusLabel,
  type AdminUserStatus,
  type IdentityStatus,
} from "@/features/admin/admin-metrics";
import { userFacingError } from "@/lib/errors";
import {
  fetchAdminUsers,
  updateAdminUserIdentity,
  updateAdminUserStatus,
  type AdminUser,
  type UserProfile,
} from "@/lib/api";

const PAGE_SIZE = 20;

const STATUS_FILTERS: ReadonlyArray<{ value: UserProfile["status"] | ""; label: string }> = [
  { value: "", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "active", label: "Actifs" },
  { value: "suspended", label: "Suspendus" },
  { value: "banned", label: "Bannis" },
];

const ROLE_FILTERS: ReadonlyArray<{ value: UserProfile["role"] | ""; label: string }> = [
  { value: "", label: "Tous les rôles" },
  { value: "passenger", label: "Passagers" },
  { value: "driver", label: "Conducteurs" },
  { value: "admin", label: "Administrateurs" },
];

function statusTone(status: UserProfile["status"]): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "suspended":
      return "warning";
    case "banned":
      return "danger";
    default:
      return "neutral";
  }
}

function identityTone(status: AdminUser["id_document_status"]): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "verified":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * User moderation table: list, filter, then change an account status or
 * validate a driver identity document.
 *
 * Every action reloads the list from the API instead of patching the local
 * copy, so the displayed state always comes from the server.
 *
 * On narrow screens the table is replaced by a card list: a five-column table
 * on a 375px screen needs a horizontal scroll to reach the action buttons,
 * which is exactly where the administrator has to tap.
 */
export function AdminUsersPanel({ onChanged }: { onChanged?: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<UserProfile["status"] | "">("");
  const [roleFilter, setRoleFilter] = useState<UserProfile["role"] | "">("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  // Bumped to force a reload of the current page (used by "Réessayer").
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminUsers({
      status: statusFilter || undefined,
      role: roleFilter || undefined,
      query: appliedQuery || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((response) => {
        if (cancelled) return;
        setUsers(response.items);
        setTotal(response.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(userFacingError(err, "Impossible de charger les utilisateurs."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, roleFilter, appliedQuery, offset, reloadKey]);

  /** Reloads the current page with the active filters. */
  async function reload() {
    const response = await fetchAdminUsers({
      status: statusFilter || undefined,
      role: roleFilter || undefined,
      query: appliedQuery || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setUsers(response.items);
    setTotal(response.total);
  }

  async function changeStatus(user: AdminUser, status: AdminUserStatus) {
    setPendingUserId(user.id);
    setNotice(null);
    try {
      await updateAdminUserStatus(user.id, status);
      setNotice(`${user.first_name} ${user.last_name} est désormais ${userStatusLabel(status).toLowerCase()}.`);
      await reload();
      onChanged?.();
    } catch (err: unknown) {
      setNotice(userFacingError(err, "Le changement de statut a échoué."));
    } finally {
      setPendingUserId(null);
    }
  }

  async function changeIdentity(user: AdminUser, idDocumentStatus: IdentityStatus) {
    setPendingUserId(user.id);
    setNotice(null);
    try {
      await updateAdminUserIdentity(user.id, idDocumentStatus);
      setNotice(
        `Pièce d'identité de ${user.first_name} ${user.last_name} : ` +
          (idDocumentStatus === "verified" ? "validée." : "refusée."),
      );
      await reload();
      onChanged?.();
    } catch (err: unknown) {
      setNotice(userFacingError(err, "La vérification d'identité a échoué."));
    } finally {
      setPendingUserId(null);
    }
  }

  const canGoBack = offset > 0;
  const canGoForward = offset + PAGE_SIZE < total;
  const hasFilters = statusFilter !== "" || roleFilter !== "" || appliedQuery !== "";

  /** The action buttons of one row, shared by the table and the card list. */
  function renderActions(user: AdminUser) {
    const statusActions = availableStatusActions(user);
    const identityActions = needsIdentityReview(user) ? availableIdentityActions(user) : [];
    if (statusActions.length === 0 && identityActions.length === 0) {
      return <span className="text-xs text-page-muted">Aucune action</span>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {statusActions.map((action) => (
          <Button
            key={action.status}
            type="button"
            variant={action.tone === "danger" ? "danger" : "secondary"}
            disabled={pendingUserId === user.id}
            onClick={() => void changeStatus(user, action.status)}
            className="!w-auto !min-h-11 !px-3 !text-sm"
          >
            {action.label}
          </Button>
        ))}
        {identityActions.map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === "verified" ? "primary" : "danger"}
            disabled={pendingUserId === user.id}
            onClick={() => void changeIdentity(user, status)}
            className="!w-auto !min-h-11 !px-3 !text-sm"
          >
            {status === "verified" ? "Valider l'identité" : "Refuser l'identité"}
          </Button>
        ))}
      </div>
    );
  }

  function renderIdentityBadge(user: AdminUser) {
    return (
      <Badge tone={identityTone(user.id_document_status)}>
        {user.id_document_status === "verified"
          ? "Vérifiée"
          : user.id_document_status === "rejected"
            ? "Refusée"
            : "En attente"}
      </Badge>
    );
  }

  function renderRoleBadge(user: AdminUser) {
    return (
      <Badge tone="neutral">
        {user.role === "driver"
          ? "Conducteur"
          : user.role === "admin"
            ? "Administrateur"
            : "Passager"}
      </Badge>
    );
  }

  return (
    <Card>
      <CardTitle>Utilisateurs</CardTitle>

      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setAppliedQuery(query);
          setLoading(true);
        }}
      >
        <div className="grid gap-1 text-sm text-page-muted">
          <label htmlFor="admin-user-search">Recherche (nom ou e-mail)</label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-page-muted"
              aria-hidden="true"
            />
            <input
              id="admin-user-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ex. ada@exemple.fr"
              className="field !min-h-11 !pl-9"
            />
          </div>
        </div>
        <div className="grid gap-1 text-sm text-page-muted">
          <label htmlFor="admin-user-status">Statut</label>
          <select
            id="admin-user-status"
            value={statusFilter}
            onChange={(event) => {
              setOffset(0);
              setStatusFilter(event.target.value as UserProfile["status"] | "");
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
        <div className="grid gap-1 text-sm text-page-muted">
          <label htmlFor="admin-user-role">Rôle</label>
          <select
            id="admin-user-role"
            value={roleFilter}
            onChange={(event) => {
              setOffset(0);
              setRoleFilter(event.target.value as UserProfile["role"] | "");
              setLoading(true);
            }}
            className="field !min-h-11"
          >
            {ROLE_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="secondary" className="!w-auto">
            Filtrer
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="!w-auto"
              onClick={() => {
                setQuery("");
                setAppliedQuery("");
                setStatusFilter("");
                setRoleFilter("");
                setOffset(0);
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Réinitialiser
            </Button>
          )}
        </div>
      </form>

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
          Chargement des utilisateurs.
        </p>
      ) : users.length === 0 ? (
        <p className="mt-4 text-sm text-page-muted">
          Aucun utilisateur ne correspond à ces filtres.
        </p>
      ) : (
        <>
          {/* Desktop: a real table. The breakpoint is lg (1024px): below it
              the five columns squeeze the action buttons out of the viewport,
              and the action buttons are exactly where the admin has to tap. */}
          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Utilisateurs de la plateforme, avec leur rôle, leur statut et les actions de
                modération disponibles.
              </caption>
              <thead>
                <tr className="border-b border-page-border text-page-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Utilisateur
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Rôle
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Statut
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Identité
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-page-border align-top"
                    aria-busy={pendingUserId === user.id}
                  >
                    <td className="py-3 pr-3">
                      <span className="block font-medium text-page-text">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="block text-page-muted break-words">{user.email}</span>
                    </td>
                    <td className="py-3 pr-3">{renderRoleBadge(user)}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={statusTone(user.status)}>{userStatusLabel(user.status)}</Badge>
                    </td>
                    <td className="py-3 pr-3">{renderIdentityBadge(user)}</td>
                    <td className="py-3">{renderActions(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile and tablet: one card per user, no horizontal scroll. */}
          <ul className="mt-4 grid gap-3 lg:hidden">
            {users.map((user) => (
              <li
                key={user.id}
                className="rounded-[var(--radius-control)] border border-page-border p-3"
                aria-busy={pendingUserId === user.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-page-text">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="break-words text-sm text-page-muted">{user.email}</p>
                  </div>
                  {renderRoleBadge(user)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={statusTone(user.status)}>{userStatusLabel(user.status)}</Badge>
                  {renderIdentityBadge(user)}
                </div>
                <div className="mt-3">{renderActions(user)}</div>
              </li>
            ))}
          </ul>
        </>
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
