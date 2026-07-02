import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({ meta: [{ title: "Contas Bancárias · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Contas Bancárias" description="Contas por loja e saldos esperados." />,
});
