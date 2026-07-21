import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => ({
    meta: [{ title: "Cartões de Crédito · Connect 7" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <StubPage title="Cartões de Crédito" description="Cadastro dos cartões por loja, com taxas e prazos de recebimento." />,
});
