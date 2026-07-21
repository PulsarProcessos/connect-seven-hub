import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({
    meta: [{ title: "Contas a Pagar · Connect 7" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <StubPage title="Contas a Pagar" description="Registro e acompanhamento dos pagamentos da empresa." />,
});
