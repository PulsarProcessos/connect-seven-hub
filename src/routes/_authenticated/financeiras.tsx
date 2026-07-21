import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { CatalogoTaxasPage } from "@/components/catalogo-taxas-page";

export const Route = createFileRoute("/_authenticated/financeiras")({
  head: () => ({
    meta: [
      { title: "Financeiras · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceirasPage,
});

function FinanceirasPage() {
  return (
    <AppLayout>
      <CatalogoTaxasPage
        catalogoTable="financeiras"
        vinculoTable="loja_financeiras"
        fkColuna="id_financeira"
        titulo="Financeiras"
        subtitulo="Financiadoras e as taxas negociadas por cada loja."
        singular="financeira"
        placeholderNome="Ex.: AIVA"
      />
    </AppLayout>
  );
}
