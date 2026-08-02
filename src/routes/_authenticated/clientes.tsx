import { createFileRoute } from "@tanstack/react-router";
import { PessoasPage } from "@/components/pessoas-page";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes · Connect 7" },
      {
        name: "description",
        content: "Cadastro de clientes usados nas entradas e no contas a receber.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PessoasPage
      tabela="clientes"
      titulo="Clientes"
      subtitulo="Cadastro usado nas entradas, no contas a receber e na classificação do extrato."
      singular="Cliente"
    />
  ),
});
