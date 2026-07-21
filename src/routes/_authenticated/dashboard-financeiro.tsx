import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/dashboard-financeiro")({
  head: () => ({
    meta: [{ title: "Dashboard Financeiro · Connect 7" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <StubPage
      title="Dashboard Financeiro"
      description="Visão financeira consolidada da loja (fluxo de caixa, DRE, projeções). Em construção."
    />
  ),
});
