import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [{ title: "Comissões · Connect 7" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <StubPage title="Comissões" description="Faixas de comissão por loja e volume de vendas." />,
});
