"use client";

import { FormEvent } from "react";
import { MessageSquareMore } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ConversationDetail, ReportReason } from "@/lib/api";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "safety", label: "Sécurité" },
  { value: "harassment", label: "Harcèlement" },
  { value: "no_show", label: "Absence au rendez-vous" },
  { value: "vehicle", label: "Véhicule" },
  { value: "payment", label: "Paiement" },
  { value: "other", label: "Autre" },
];

export function ConversationThread({
  conversation,
  currentUserId,
  draft,
  onDraftChange,
  isSending,
  notice,
  onSend,
  onReport,
  onBlock,
}: {
  conversation: ConversationDetail | null;
  currentUserId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  isSending: boolean;
  notice: string | null;
  onSend: (event: FormEvent) => void;
  onReport: (event: FormEvent<HTMLFormElement>) => void;
  onBlock: () => void;
}) {
  if (!conversation) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-page-text">
          <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
          <h2 className="font-semibold">Sélectionnez une conversation</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-page-text">
            {conversation.peer.first_name} {conversation.peer.last_name}
          </h2>
          <p className="text-sm text-page-muted">
            {conversation.trip_origin_label} → {conversation.trip_destination_label}
          </p>
        </div>
        <Badge tone={conversation.can_send ? "success" : "warning"}>
          {conversation.can_send ? "Ouverte" : "Lecture seule"}
        </Badge>
      </div>

      <div className="mb-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-page-border bg-brand-50 p-3">
        {conversation.messages.length === 0 ? (
          <p className="text-sm text-page-muted">Aucun message pour l’instant.</p>
        ) : (
          conversation.messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={mine ? "text-right" : "text-left"}>
                <p
                  className={
                    "inline-block max-w-[80%] rounded-xl px-3 py-2 text-sm " +
                    (mine ? "bg-primary-strong text-white" : "bg-white text-page-text")
                  }
                >
                  {message.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={onSend}>
        <label htmlFor="message-draft" className="sr-only">
          Écrire un message
        </label>
        <input
          id="message-draft"
          className="field"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Écrire un message"
          maxLength={2000}
          disabled={!conversation.can_send || isSending}
        />
        <Button type="submit" disabled={!conversation.can_send || isSending || !draft.trim()}>
          Envoyer
        </Button>
      </form>

      <form className="mt-6 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={onReport}>
        <label htmlFor="report-reason" className="sr-only">
          Motif du signalement
        </label>
        <select id="report-reason" name="reason" className="field" defaultValue="harassment">
          {REPORT_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
        <label htmlFor="report-details" className="sr-only">
          Détails du signalement
        </label>
        <input id="report-details" name="details" className="field" placeholder="Détails (optionnel)" maxLength={2000} />
        <Button type="submit" variant="secondary">
          Signaler
        </Button>
      </form>
      <div className="mt-3">
        <Button type="button" variant="danger" onClick={onBlock}>
          Bloquer
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-page-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
