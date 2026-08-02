import { createFileRoute } from "@tanstack/react-router";
import { PessoasPage } from "@/components/pessoas-page";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores · Connect 7" },
      {
        name: "description",
        content: "Cadastro de fornecedores usados nas saídas e no contas a pagar.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PessoasPage
      tabela="fornecedores"
      titulo="Fornecedores"
      subtitulo="Cadastro usado nas saídas, no contas a pagar e na classificação do extrato."
      singular="Fornecedor"
    />
  ),
});
