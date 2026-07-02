import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários · Connect 7" }, { name: "robots", content: "noindex" }] }),
  component: () => <StubPage title="Usuários" description="Perfis, papéis e vínculos com lojas." />,
});
