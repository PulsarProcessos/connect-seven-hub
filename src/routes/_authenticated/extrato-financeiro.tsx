import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/extrato-financeiro")({
  head: () => ({
    meta: [
      { title: "Extrato Financeiro · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <StubPage
      title="Extrato Financeiro"
      description="Visão unificada de vendas Ucase e movimentações manuais."
    />
  ),
});
