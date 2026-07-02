import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({ meta: [{ title: "Conciliação · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Conciliação" description="Conciliação de recebíveis com extrato bancário." />,
});
