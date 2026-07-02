import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas Ucase · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Vendas Ucase" description="Importação e visualização de vendas por adquirente." />,
});
