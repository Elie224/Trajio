"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Card, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ServiceError } from "@/components/ui/ServiceError";
import { SessionStatus } from "@/features/auth/SessionStatus";
import { useSession } from "@/features/auth/useSession";
import { ConversationList } from "@/features/messages/ConversationList";
import { ConversationThread } from "@/features/messages/ConversationThread";
import { userFacingError } from "@/lib/errors";
import {
  blockUser,
  createReport,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  openConversation,
  sendMessage,
  type ConversationDetail,
  type ConversationSummary,
  type ReportReason,
} from "@/lib/api";
import { useSearchParams } from "next/navigation";

export function MessagesInbox() {
  const session = useSession();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  // Incremented to trigger a reload of the conversation list; the loaded state is
  // tagged with the key it belongs to so a stale list is never displayed.
  const [listKey, setListKey] = useState(0);
  const [loadedListKey, setLoadedListKey] = useState<number | null>(null);
  const [active, setActive] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const openedBookingRef = useRef<string | null>(null);

  const refreshList = async () => {
    const items = await fetchConversations();
    setConversations(items);
    return items;
  };

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    void fetchConversations()
      .then((items) => {
        if (cancelled) return;
        setConversations(items);
        setLoadedListKey(listKey);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(userFacingError(error, "Impossible de charger vos messages."));
        setLoadedListKey(listKey);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, listKey]);

  useEffect(() => {
    if (session.status !== "authenticated" || listLoading || listError) return;
    let cancelled = false;

    const run = async () => {
      try {
        if (bookingId && openedBookingRef.current !== bookingId) {
          openedBookingRef.current = bookingId;
          const opened = await openConversation(bookingId);
          if (cancelled) return;
          activeIdRef.current = opened.id;
          setActive(opened);
          await markConversationRead(opened.id);
          const items = await fetchConversations();
          if (!cancelled) setConversations(items);
          return;
        }
        if (activeIdRef.current || !conversations[0]) return;
        const detail = await fetchConversation(conversations[0].id);
        if (cancelled || activeIdRef.current) return;
        activeIdRef.current = detail.id;
        setActive(detail);
        await markConversationRead(detail.id);
      } catch (error: unknown) {
        if (!cancelled) {
          setNotice(userFacingError(error, "Impossible d'ouvrir la conversation."));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [session.status, listLoading, listError, bookingId, conversations]);

  useEffect(() => {
    const id = active?.id;
    if (!id) return;
    const timer = window.setInterval(() => {
      void fetchConversation(id)
        .then((detail) => {
          if (activeIdRef.current === id) setActive(detail);
        })
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  if (session.status !== "authenticated") {
    return (
      <SessionStatus
        session={session}
        loadingLabel="Chargement des messages…"
        anonymousBody="Connectez-vous pour écrire au conducteur ou au passager d’une réservation."
      />
    );
  }

  if (listLoading || (loadedListKey !== listKey && !listError)) {
    return (
      <section className="page-section">
        <Container>Chargement des messages…</Container>
      </section>
    );
  }

  if (listError) {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Erreur</CardTitle>
            <ServiceError
              className="mt-3"
              message={listError}
              onRetry={() => {
                setListError(null);
                setListLoading(true);
                setListKey((key) => key + 1);
              }}
            />
          </Card>
        </Container>
      </section>
    );
  }

  async function selectConversation(id: string) {
    setNotice(null);
    const detail = await fetchConversation(id);
    activeIdRef.current = detail.id;
    setActive(detail);
    await markConversationRead(id);
    setConversations(await refreshList());
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim()) return;
    setIsSending(true);
    setNotice(null);
    try {
      await sendMessage(active.id, draft.trim());
      setDraft("");
      setActive(await fetchConversation(active.id));
      setConversations(await refreshList());
    } catch (error: unknown) {
      setNotice(userFacingError(error, "Le message n'a pas pu être envoyé."));
    } finally {
      setIsSending(false);
    }
  }

  async function onReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    const form = new FormData(event.currentTarget);
    try {
      await createReport({
        reportedUserId: active.peer.id,
        reason: String(form.get("reason") ?? "other") as ReportReason,
        bookingId: active.booking_id,
        details: String(form.get("details") ?? ""),
      });
      setNotice("Signalement envoyé.");
      event.currentTarget.reset();
    } catch (error: unknown) {
      setNotice(userFacingError(error, "Le signalement n'a pas pu être envoyé."));
    }
  }

  async function onBlock() {
    if (!active) return;
    try {
      await blockUser(active.peer.id);
      setNotice("Cette personne est bloquée. Vous ne pourrez plus échanger ni réserver ensemble.");
      setActive(await fetchConversation(active.id));
    } catch (error: unknown) {
      setNotice(userFacingError(error, "Le blocage a échoué."));
    }
  }

  return (
    <section className="page-section">
      <Container>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-page-text sm:text-3xl">Messages</h1>
          <p className="mt-2 text-sm text-page-muted">
            Conversations liées à vos réservations. Les coordonnées hors Trajio restent masquées.
          </p>
        </div>

        <div className="surface grid overflow-hidden lg:grid-cols-[320px_1fr]">
          <ConversationList
            conversations={conversations}
            selectedId={active?.id ?? null}
            onSelect={(id) => void selectConversation(id)}
          />
          <ConversationThread
            conversation={active}
            currentUserId={session.user.id}
            draft={draft}
            onDraftChange={setDraft}
            isSending={isSending}
            notice={notice}
            onSend={(event) => void onSend(event)}
            onReport={(event) => void onReport(event)}
            onBlock={() => void onBlock()}
          />
        </div>
      </Container>
    </section>
  );
}
