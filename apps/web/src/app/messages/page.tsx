import { Suspense } from "react";

import { Container } from "@/components/ui/Container";
import { MessagesInbox } from "@/features/messages/MessagesInbox";

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <section className="page-section">
          <Container>Chargement des messages…</Container>
        </section>
      }
    >
      <MessagesInbox />
    </Suspense>
  );
}
