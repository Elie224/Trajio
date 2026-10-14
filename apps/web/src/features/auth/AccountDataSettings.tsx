"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { ACCOUNT_DELETED_FLAG } from "@/lib/account-flags";
import { ApiError, deleteAccount, exportMyData, fetchDeletionPreview } from "@/lib/api";
import { retryAfterMinutes } from "@/lib/retry-after";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Mes données                                                         */
/* ------------------------------------------------------------------ */

type ExportState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trajio-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportSection() {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const pending = state.status === "pending";

  const runExport = async () => {
    setState({ status: "pending" });
    try {
      downloadJson(await exportMyData());
      setState({ status: "success" });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 429) {
        setState({
          status: "error",
          message: "Vous avez déjà demandé un export récemment, réessayez dans quelques minutes.",
        });
        return;
      }
      setState({ status: "error", message: "Le téléchargement de vos données a échoué." });
    }
  };

  return (
    <Card>
      <section id="mes-donnees" aria-labelledby="mes-donnees-title">
        <h2 id="mes-donnees-title" className="text-base font-semibold text-slate-900">
          Mes données
        </h2>
        <CardBody>
          Téléchargez une copie de toutes les données liées à votre compte : profil, véhicules,
          trajets publiés et réservations. Le fichier est au format JSON, lisible par un humain et
          réutilisable dans un autre service.
        </CardBody>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={runExport} disabled={pending} aria-busy={pending}>
            {pending && <Spinner />}
            {pending ? "Préparation…" : "Télécharger mes données"}
          </Button>
          <p role="status" aria-live="polite" className="text-sm">
            {state.status === "success" && (
              <span className="text-emerald-700">Vos données ont été téléchargées.</span>
            )}
          </p>
        </div>
        {state.status === "error" && (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-rose-700">
            <span>{state.message}</span>
            <button
              type="button"
              onClick={runExport}
              className="font-medium underline hover:text-rose-800"
            >
              Réessayer
            </button>
          </div>
        )}
      </section>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Zone de danger                                                      */
/* ------------------------------------------------------------------ */

type DeletionPreview = { trips: number; bookings: number };

function parsePreview(data: unknown): DeletionPreview | null {
  if (!data || typeof data !== "object") return null;
  const { trips, bookings } = data as Record<string, unknown>;
  if (
    typeof trips !== "number" ||
    typeof bookings !== "number" ||
    !Number.isInteger(trips) ||
    !Number.isInteger(bookings) ||
    trips < 0 ||
    bookings < 0
  ) {
    return null;
  }
  return { trips, bookings };
}

/** "1 trajet à venir", "2 trajets à venir", "aucune réservation". */
function countLabel(count: number, singular: string, plural: string, feminine: boolean): string {
  if (count === 0) return `${feminine ? "aucune" : "aucun"} ${singular}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Password stays in this component's local state only: never logged, never global.
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ kind: "password" | "general"; message: string } | null>(null);
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setStep(1);
      setError(null);
      setPreview(null);
      setPreviewError(null);
      dialog.showModal();
      // autoFocus is not honoured on re-opened dialogs: focus "Annuler" explicitly.
      cancelRef.current?.focus();
      fetchDeletionPreview()
        .then((data) => setPreview(parsePreview(data)))
        .catch((err: unknown) => {
          setPreview(null);
          if (err instanceof ApiError && err.status === 429) {
            setPreviewError(
              err.retryAfter !== null
                ? `Le détail de ce qui sera annulé est momentanément indisponible (trop de demandes). Réessayez dans ${retryAfterMinutes(err.retryAfter)} min.`
                : "Le détail de ce qui sera annulé est momentanément indisponible (trop de demandes).",
            );
          } else if (!(err instanceof ApiError && err.status === 404)) {
            setPreviewError("Le détail de ce qui sera annulé n'a pas pu être chargé.");
          }
        });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (step === 2) passwordRef.current?.focus();
  }, [step]);

  const close = () => {
    if (submitting) return;
    setPassword("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    const value = password;
    try {
      await deleteAccount(value);
      setPassword("");
      try {
        sessionStorage.setItem(ACCOUNT_DELETED_FLAG, "1");
      } catch {
        // Storage unavailable: the redirect still happens.
      }
      // Full navigation drops every in-memory auth state (header, dashboard).
      window.location.assign("/");
      return;
    } catch (err: unknown) {
      setPassword("");
      if (err instanceof ApiError && err.status === 403) {
        setError({ kind: "password", message: "Mot de passe incorrect" });
      } else if (err instanceof ApiError && err.status === 429) {
        setError({
          kind: "general",
          message: "Trop de tentatives. Réessayez dans quelques minutes.",
        });
      } else {
        setError({ kind: "general", message: "La suppression a échoué. Réessayez." });
      }
      setSubmitting(false);
      requestAnimationFrame(() => passwordRef.current?.focus());
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        // Escape: blocked while the request is in flight.
        event.preventDefault();
        close();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 backdrop:fixed backdrop:inset-0 backdrop:bg-slate-900/50"
    >
      {step === 1 ? (
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Supprimer votre compte ?
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            <p>Cette action est définitive :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>vos informations personnelles seront anonymisées ;</li>
              <li>toutes vos sessions ouvertes seront fermées ;</li>
              <li>vos trajets et réservations à venir seront annulés.</li>
            </ul>
            {preview && (
              <p className="font-medium text-slate-800">
                Concerné : {countLabel(preview.trips, "trajet à venir", "trajets à venir", false)} et{" "}
                {countLabel(preview.bookings, "réservation à venir", "réservations à venir", true)}.
              </p>
            )}
            {previewError && (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {previewError}
              </p>
            )}
            <p>
              Vous pouvez d&apos;abord{" "}
              <a href="#mes-donnees" onClick={close} className="font-medium text-primary-strong underline underline-offset-2">
                télécharger vos données
              </a>
              .
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button ref={cancelRef} type="button" variant="secondary" onClick={close}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(2)}
              className="!text-rose-700 !ring-rose-300 hover:!bg-rose-50"
            >
              Continuer
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Confirmez avec votre mot de passe
          </h2>
          <label htmlFor="delete-account-password" className="label mt-4 block">
            Mot de passe
          </label>
          <input
            ref={passwordRef}
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            className={"field " + (error?.kind === "password" ? "!border-danger" : "")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            aria-invalid={error?.kind === "password"}
            aria-describedby={error?.kind === "password" ? errorId : undefined}
          />
          {error?.kind === "password" && (
            <p id={errorId} className="mt-1 text-sm font-medium text-danger">
              {error.message}
            </p>
          )}
          {error?.kind === "general" && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error.message}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
              Annuler
            </Button>
            <button
              type="submit"
              disabled={password === "" || submitting}
              aria-busy={submitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-danger px-5 text-base font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Spinner />}
              Supprimer définitivement
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <Card className="!ring-rose-200">
      <CardTitle>Zone de danger</CardTitle>
      <CardBody>
        La suppression de votre compte est définitive. Vos données personnelles seront
        anonymisées.
      </CardBody>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
      >
        Supprimer mon compte
      </button>
      <DeleteAccountDialog
        open={open}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
      />
    </Card>
  );
}

export function AccountDataSettings() {
  return (
    <>
      <ExportSection />
      <DangerZone />
    </>
  );
}
