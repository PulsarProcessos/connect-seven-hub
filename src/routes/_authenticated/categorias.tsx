import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias (DRE) · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <StubPage
      title="Categorias (DRE)"
      description="Grupos e categorias do Demonstrativo de Resultados."
    />
  ),
});
