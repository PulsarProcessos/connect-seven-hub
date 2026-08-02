## Objetivo

Evoluir o Caixa (depósito em lotérica, comprovantes por foto, reabertura/exclusão de fechamentos), anexar comprovantes em Contas a Pagar/Receber/Extrato, reestruturar Fluxo de Caixa (3 visões de data) e DRE (por competência), e criar o módulo de Orçamento com a seção Orçado x Realizado no Dashboard.

## 1. Banco de dados (uma migração)

Verificado hoje no schema: não existem colunas de comprovante, nem data de competência, nem tabela de orçamento — tudo abaixo é novo.

Novas tabelas:
- `comprovantes` — vínculo polimórfico (tipo de origem + id da origem), loja, caminho do arquivo no storage, nome, tamanho, quem enviou. Serve para caixa, contas a pagar, contas a receber e movimentações.
- `caixa_depositos` — caixa, loja, nº do comprovante, valor depositado, data, conta bancária de destino, status de conciliação, id do lançamento do extrato conciliado.
- `orcamentos` — loja, categoria da DRE, ano, mês, valor orçado, observação (único por loja+categoria+mês).

Colunas novas:
- `caixas`: `turno`, `total_sangrias`, `total_suprimentos`, `total_depositado`, `dinheiro_apurado`, `diferenca_caixa`, `reaberto_por`, `reaberto_em`, `motivo_reabertura`.
- `caixa_lancamentos`: `id_conta_bancaria` (obrigatório quando a forma de pagamento for PIX, transferência ou depósito bancário — validado por trigger).
- `contas_pagar`, `contas_receber`, `movimentacoes`: `data_competencia` (preenchida com a data atual do registro nas linhas existentes).
- `contas_pagar`: `id_loja_rateio_origem` e `percentual_rateio`, para despesa rateada de outra loja/matriz aparecer proporcional na DRE de cada loja.

Bucket de storage privado `comprovantes`, com políticas por loja (mesmo padrão `can_access_loja`), aceitando foto tirada pelo celular.

Regras de acesso: administrador e gerente podem reabrir caixa fechado, editar lançamentos de caixa fechado e excluir fechamentos; operador só opera o próprio caixa aberto. Trigger recalcula sangrias, suprimentos, depósitos, dinheiro apurado e diferença a cada lançamento.

Views:
- `vw_fluxo_caixa` — une Contas a Pagar, Contas a Receber e recebíveis de cartão/financeira (usando a **data prevista de repasse do adquirente**, não a data da venda), com as três datas (competência, vencimento, realização) e marcação realizado/projetado, por loja.
- `vw_dre_competencia` — receita (vendas), despesas (pagar), comissões e rateios, agrupados por categoria da DRE e **data de competência**, por loja e consolidado.
- `vw_orcado_realizado` — orçado por categoria/loja/mês cruzado com o realizado da DRE, com variação em % e tolerante a loja sem orçamento (mostra realizado com orçado zero, sem quebrar).

Observação: não existe módulo de estoque no sistema, então o **CMV** entra na DRE pelas categorias do grupo de custo lançadas em Contas a Pagar. Um CMV vindo de estoque exigiria um módulo novo — fora deste escopo.

## 2. Caixa (revisão + novidades)

- Abertura por **loja e turno**, com saldo inicial; um caixa aberto por loja/turno.
- Painel do caixa com blocos: Suprimentos, Sangrias, Depósitos, Dinheiro apurado e **Diferença de caixa**, sempre visíveis.
- **Depósito na lotérica**: nº do comprovante, valor, data, conta bancária de destino e **upload/foto do comprovante** (câmera direta no celular/tablet). Cada depósito gera um lançamento esperado a conciliar.
- Lançamentos com forma de pagamento PIX / transferência / depósito bancário passam a exigir a **conta bancária** do recebimento.
- **Fechamento**: informa dinheiro apurado, mostra a diferença calculada e permite anexar a foto do comprovante do depósito antes de concluir.
- **Reabertura e exclusão**: administrador e gerente veem botões "Reabrir caixa" (com motivo), "Editar lançamento" e "Excluir fechamento", com confirmação; o histórico de reabertura fica registrado.

## 3. Conciliação bancária

Os depósitos de lotérica entram na lista de itens esperados da conciliação (por valor, data e conta), podendo casar com o lançamento do extrato importado; ao conciliar, o depósito muda para "conciliado".

## 4. Comprovantes em Contas a Pagar, Contas a Receber e Extrato Financeiro

Em cada tela, o detalhe do lançamento ganha uma área "Comprovantes": upload (arquivo ou foto), lista de anexos, visualização em nova aba e exclusão. Ícone de clipe na listagem indica quem já tem comprovante.

## 5. Fluxo de Caixa

- Seletor de base de data: **Competência / Vencimento / Realização** (padrão: Realização).
- Visão **Realizado x Projetado** por mês, filtrável por loja (e consolidado do grupo, com CNPJ).
- Recebíveis de cartão projetados pela data prevista de repasse.
- Saldo inicial por loja configurável, usado no fechamento de mês (saldo inicial + entradas − saídas = saldo final que vira inicial do mês seguinte).

## 6. DRE (Financeiro)

- Passa a ser montada por **data de competência**.
- Linhas: Receita (vendas), CMV, Despesas (contas a pagar) e Comissões.
- **Drill-down por loja** e coluna de **comparação entre lojas** lado a lado, com consolidado do grupo.
- Despesa rateada aparece proporcionalmente em cada loja conforme o percentual cadastrado.

## 7. Orçamento e Orçado x Realizado

- **Movimentação Bancária › Orçamento**: tela para cadastrar o valor orçado por **categoria da DRE**, por loja, mês a mês (grade ano inteiro, cópia do mês anterior e do ano anterior).
- **Dashboard › Orçado x Realizado**: nova aba ao lado de Financeiro e Fluxo de Caixa, com orçado, realizado e **variação em %** por categoria e por loja, no mês/ano escolhido; loja sem orçamento aparece com orçado zerado e aviso, sem quebrar o relatório.

## Detalhes técnicos

- Uma migração com tabelas, colunas, GRANTs, RLS, triggers de recálculo do caixa e as três views com `security_invoker`.
- Bucket privado `comprovantes` + componente reutilizável `ComprovantesPanel` (input `capture="environment"` para foto).
- Novas rotas: `orcamento` e `dashboard-orcado-realizado`; ajustes em `caixa.tsx`, `dashboard-financeiro.tsx`, `contas-pagar.tsx`, `contas-receber.tsx`, `extrato-financeiro.tsx`, `conciliacao-panel.tsx`, `app-layout.tsx` e `auth-context.tsx`.
- Ao final, rodo a verificação de segurança do banco e reporto o resultado.
