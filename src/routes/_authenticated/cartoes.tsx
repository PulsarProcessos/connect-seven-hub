import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { CatalogoTaxasPage } from "@/components/catalogo-taxas-page";

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => ({
    meta: [
      { title: "Cartões de Crédito · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartoesPage,
});

function CartoesPage() {
  return (
    <AppLayout>
      <CatalogoTaxasPage
        catalogoTable="cartoes"
        vinculoTable="loja_cartoes"
        fkColuna="id_cartao"
        titulo="Cartões de Crédito"
        subtitulo="Bandeiras aceitas e as taxas negociadas por cada loja."
        singular="bandeira"
        placeholderNome="Ex.: Mastercard"
      />
    </AppLayout>
  );
}
