import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({ meta: [{ title: "Alertas · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Alertas" description="Recebíveis atrasados e divergências abertas." />,
});
