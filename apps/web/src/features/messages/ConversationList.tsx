"use client";

import { Badge } from "@/components/ui/Badge";
import type { ConversationSummary } from "@/lib/api";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="border-b border-page-border p-4 lg:border-r lg:border-b-0">
      <p className="text-xs font-semibold text-page-muted">Conversations</p>
      {conversations.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-page-border bg-brand-50 p-4 text-sm text-page-muted">
          Aucune conversation. Elles apparaissent dès qu’une réservation est ouverte.
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {conversations.map((conversation) => {
            const selected = conversation.id === selectedId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={selected ? "true" : undefined}
                  className={
                    "min-h-12 w-full rounded-xl border p-3 text-left " +
                    (selected ? "border-primary bg-brand-50" : "border-page-border bg-white")
                  }
                >
                  <p className="font-medium text-page-text">
                    {conversation.peer.first_name} {conversation.peer.last_name}
                  </p>
                  <p className="text-sm text-page-muted">
                    {conversation.trip_origin_label} → {conversation.trip_destination_label}
                  </p>
                  {conversation.unread_count > 0 && (
                    <Badge tone="warning">{conversation.unread_count} non lu(s)</Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
