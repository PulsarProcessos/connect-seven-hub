import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/lojas")({
  head: () => ({ meta: [{ title: "Lojas · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Lojas" description="Matriz e filiais da holding." />,
});
