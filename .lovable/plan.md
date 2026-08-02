## Objetivo

Corrigir os erros de cadastro relatados, construir o Dashboard Financeiro (DRE interativa + Fluxo de Caixa) e revisar o isolamento de dados por loja/nível de usuário.

## 1. Correção dos cadastros com erro

Verificado no código e no banco:

- **Nova saída (Despesa/Venda/Transferência)** — o botão "Novo" converte o valor com `Number(valor.replace(",", "."))`. Se o usuário digita no formato brasileiro com milhar (`1.500,00`), o resultado é inválido e o lançamento é recusado. Correção: aplicar a mesma máscara monetária já usada em Comissões (digitação da direita para a esquerda) e um parser único compartilhado.
- Ainda no mesmo formulário: quando o administrador está com "Todas as lojas" selecionado, o campo Loja abre vazio e o erro só aparece ao salvar — passará a bloquear o botão com aviso claro.
- **Comissões** — a estrutura da tabela, as regras de acesso e as permissões estão corretas no banco (apenas administrador grava). A causa exata do erro ainda **não está confirmada**; primeira tarefa da implementação: reproduzir o cadastro de faixa e capturar a mensagem real (validação de percentual, faixa sobreposta ou permissão), e então corrigir. As mensagens de erro passarão a exibir texto explicativo em vez do erro técnico do banco.

## 2. Varredura dos demais módulos

Passar por Financeiras, Lojas/Tipos de loja, Contas bancárias, Cartões, Categorias (DRE), Usuários, Contas a Pagar, Importação de Vendas, Importação de Extrato e Conciliação, testando criar/editar/excluir em cada um. Para cada falha encontrada: corrigir e padronizar máscaras (moeda, percentual, data) e mensagens de erro. Entrego uma lista do que foi verificado e do que foi corrigido.

## 3. Dashboard Financeiro (`/dashboard-financeiro`)

Hoje a página é apenas um marcador. Será reconstruída com duas seções em abas:

**Aba DRE**
- Layout em duas colunas: à esquerda a DRE em tabela (Categoria | Valor | % sobre a receita), agrupada por grupo DRE com totais e possibilidade de expandir/recolher.
- Ao clicar em uma categoria (ou em um grupo), a tabela à direita mostra os lançamentos daquela categoria no período (data, descrição, loja, conta, valor), com total.
- Linha de receita bruta, total de despesas e resultado no rodapé.

**Aba Fluxo de Caixa**
- Panorama de **a receber** (vendas com recebimento previsto) e **a pagar** (contas a pagar), com saldo projetado.
- Quebra por semana/vencimento dentro do período, com marcação de vencidos, e listagem dos itens.

**Filtros**: seletor de **mês** e **ano** em todas as seções (padrão: mês corrente), mais o filtro de loja já existente na barra superior.

## 4. Isolamento por loja e por nível

- Revisão das regras de acesso no banco tabela por tabela (vendas, extrato, movimentações, contas a pagar, contas bancárias, comissões, categorias, usuários, importações), confirmando que cada consulta é limitada à loja do usuário e que administrador/master enxergam todas.
- Revisão do lado da tela: garantir que nenhuma listagem, seletor de loja ou consulta ignore o escopo, e que gerente/analista/operador nunca recebam a lista completa de lojas nem consigam lançar em outra loja.
- Ajuste das telas novas (DRE e Fluxo de Caixa) para respeitarem o mesmo escopo.
- Ao final, rodar a verificação de segurança do banco e relatar o resultado.

## Detalhes técnicos

- Utilitário compartilhado de máscara/parse monetário em `src/lib/`, reaproveitado no botão "Novo", Contas a Pagar e Comissões.
- Dashboard Financeiro em `src/routes/_authenticated/dashboard-financeiro.tsx`, com componentes separados para DRE e Fluxo de Caixa; dados via a view financeira já existente (`vw_extrato_financeiro`) mais `vendas_ucase` e `contas_pagar`, consultados com React Query.
- Correções de regras de acesso, se necessárias, entram como migração do banco (apresentada para aprovação antes de rodar).
