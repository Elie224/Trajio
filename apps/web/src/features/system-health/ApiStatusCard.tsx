"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { fetchApiHealth, type HealthPayload } from "@/lib/api";
import { env } from "@/lib/env";

type HealthState =
  | { status: "loading" }
  | { status: "online"; payload: HealthPayload }
  | { status: "offline"; message: string };

function toneFor(state: HealthState) {
  if (state.status === "online") return "success" as const;
  if (state.status === "offline") return "danger" as const;
  return "warning" as const;
}

function labelFor(state: HealthState) {
  if (state.status === "online") return "En ligne";
  if (state.status === "offline") return "Injoignable";
  return "Vérification";
}

/**
 * Proves the frontend reaches the backend through the real HTTP stack.
 * This is a genuine integration check, not a mock.
 */
export function ApiStatusCard() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetchApiHealth(controller.signal)
      .then((payload) => setState({ status: "online", payload }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "offline",
          message: error instanceof Error ? error.message : "Erreur inconnue",
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>État de l&apos;API</CardTitle>
          <CardBody>
            <code className="text-xs text-slate-500">{env.apiBaseUrl + "/health"}</code>
          </CardBody>
        </div>
        <Badge tone={toneFor(state)}>{labelFor(state)}</Badge>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
        {state.status === "loading" && (
          <p className="text-slate-500">Contact de l&apos;API…</p>
        )}

        {state.status === "offline" && (
          <div>
            <p className="text-rose-700">{state.message}</p>
            <p className="mt-2 text-xs text-slate-500">
              Démarrez l&apos;API avec le script{" "}
              <code>start-api.ps1</code>, puis rechargez cette page.
            </p>
          </div>
        )}

        {state.status === "online" && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Service</dt>
              <dd className="font-medium text-slate-800">{state.payload.service}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Version</dt>
              <dd className="font-medium text-slate-800">{state.payload.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Environnement</dt>
              <dd className="font-medium text-slate-800">{state.payload.environment}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-slate-500">Contrat</dt>
              <dd className="font-medium text-emerald-700">JSON conforme</dd>
            </div>
          </dl>
        )}
      </div>
    </Card>
  );
}
