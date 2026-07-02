import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/financeiras")({
  head: () => ({ meta: [{ title: "Financeiras · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Financeiras" description="Cadastro de adquirentes, taxas e prazos." />,
});
