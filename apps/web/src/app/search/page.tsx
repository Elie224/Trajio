import { Suspense } from "react";

import { Container } from "@/components/ui/Container";
import { SearchWorkspace } from "@/features/search/SearchWorkspace";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <section className="page-section">
          <Container>Chargement de la recherche…</Container>
        </section>
      }
    >
      <SearchWorkspace />
    </Suspense>
  );
}
