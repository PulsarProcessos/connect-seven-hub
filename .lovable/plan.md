## Objetivo

Ampliar o Connect 7 com: baixa/edição de lançamentos no Extrato Financeiro, aba Contas a Receber, importação de OFX com classificação lançamento a lançamento, novo menu Cadastros (com Fornecedores e Clientes), comissões por loja e por vendedor com geração automática em Contas a Pagar, e módulo de Caixa com controle de saldos bancários.

## 1. Banco de dados (uma migração, apresentada para aprovação)

Novas tabelas:
- `fornecedores` e `clientes` — nome, documento (CPF/CNPJ), telefone, e-mail, observação, ativo, `id_loja` (nulo = disponível a todas as lojas).
- `caixas` — loja, operador, data/hora de abertura e fechamento, saldo inicial informado, saldo final informado, saldo calculado, divergência, status (aberto/fechado).
- `caixa_lancamentos` — caixa, tipo (entrada/saída/sangria/suprimento), valor, descrição, categoria, cliente/fornecedor, forma de pagamento.
- `comissao_regras` — substitui/estende as faixas: vínculo por loja e (opcional) por vendedor, com faixas (valor mín/máx, percentual), vigência e ativo.
- `contas_receber` — origem (venda importada, caixa, lançamento manual), loja, cliente, categoria, descrição, valor previsto, valor recebido, vencimento, data de recebimento, conta bancária, status.

Colunas novas:
- `contas_bancarias`: `saldo_inicial`, `data_saldo_inicial`.
- `vendas_ucase`: `id_vendedor`.
- `contas_pagar`: `id_fornecedor`, `id_venda_origem` (para a comissão gerada).
- `movimentacoes`: `id_fornecedor`, `id_cliente`, `pago` / `data_liquidacao`.
- `extrato_lancamentos`: `id_categoria`, `id_fornecedor`, `id_cliente`, `classificado`.

Regras de acesso (RLS) e GRANTs em todas as tabelas novas, seguindo o mesmo padrão por loja já usado (administrador/master veem tudo; demais só a própria loja). Views de saldo por conta bancária e de contas a receber consolidadas, com `security_invoker`.

## 2. Extrato Financeiro

- Clique na linha abre um painel lateral com os detalhes do lançamento (entrada ou saída), permitindo editar descrição, categoria, cliente/fornecedor, conta bancária, data e valor.
- Botão "Marcar como recebido" / "Marcar como pago", com data de liquidação; status visível na listagem (coluna com etiqueta Pago/Recebido/Em aberto).
- Nova coluna **Saldo**: com uma loja + conta selecionadas mostra o saldo corrido real da conta (a partir do saldo inicial); com "todas as lojas" ou sem conta específica, mostra o saldo somado.
- Reflexo imediato na DRE e no Fluxo de Caixa (realizado x previsto).

## 3. Contas a Receber (nova tela)

- Lista todas as entradas: vendas importadas, recebimentos de caixa e lançamentos manuais.
- Filtros de mês/ano, loja, status e cliente.
- Clique no lançamento abre os detalhes; ação "Dar como recebido" (com data, valor recebido e conta bancária de crédito).
- Totais de recebido, a receber e vencido no topo.

## 4. Importação OFX com classificação

- A tela de Extrato Bancário deixa de ter as seções e passa a ter um botão **Importar arquivo**.
- O botão abre um diálogo pedindo **Loja** e **Conta bancária** (a lista de contas é recarregada conforme a loja escolhida), e em seguida o arquivo.
- Após a leitura, uma tela de conciliação em duas colunas: à esquerda o lançamento do banco (data, descrição, valor), à direita a correspondência no sistema.
- Quando não houver correspondência, a coluna da direita oferece criar o lançamento com: Fornecedor (saída) ou Cliente (entrada), Categoria e Descrição — tudo em listas com busca por digitação.
- Duplicidade por FITID continua sendo detectada e marcada.

## 5. Menu Cadastros (em Movimentação Bancária)

Novo grupo suspenso "Cadastros" com: Fornecedores, Clientes, Categorias, Contas Bancárias, Comissões, Financeiras e Cartões. As telas já existentes são **movidas** de Configurações (que fica apenas com Lojas e Usuários). Fornecedores e Clientes são telas novas com CRUD, busca e status ativo/inativo.

Nos formulários de entrada e saída (botão "Novo" e demais lançamentos), o campo Fornecedor/Cliente vira uma lista suspensa com busca por digitação.

## 6. Vendas › Comissões

- Cadastro de comissões passa a permitir regras **por loja** e **por vendedor** (usuários cadastrados), mantendo as faixas por valor.
- Na importação de vendas, o usuário seleciona **o vendedor do lote**; todas as linhas importadas recebem esse vendedor.
- Ao importar, o sistema cria automaticamente em Contas a Pagar um lançamento de comissão por venda, com descrição referenciando a venda (número/data/valor) e o fornecedor/beneficiário sendo o vendedor.
- Nova seção "Comissões" em Vendas: acompanhamento do desempenho por loja e por vendedor (total vendido, comissão apurada, comissão paga/em aberto), com filtros de mês e ano.

## 7. Vendas › Caixa

- Abertura de caixa informando o saldo inicial; um caixa aberto por loja por vez.
- Divergência entre saldo informado e saldo esperado é exibida na tela com aviso de que precisa ser resolvida.
- Lançamentos do caixa (entradas, saídas, sangria, suprimento) ficam registrados no caixa aberto, com saldo corrente sempre visível.
- No fechamento, informa o saldo final; os lançamentos geram automaticamente os registros correspondentes em Contas a Pagar e Contas a Receber.

## 8. Isolamento por loja

Todas as telas e tabelas novas respeitam o escopo por loja/nível já existente. Ao final rodo a verificação de segurança do banco e relato o resultado.

## Detalhes técnicos

- Migração única com tabelas, colunas, GRANTs, políticas RLS e views de saldo; triggers para recalcular saldo de conta e status de contas a receber.
- Componentes novos em `src/components/` (combobox com busca, painel de detalhe de lançamento, diálogo de importação OFX) e rotas novas em `src/routes/_authenticated/` (`contas-receber`, `fornecedores`, `clientes`, `caixa`, `vendas-comissoes`).
- Reaproveitamento de `src/lib/money.ts` para máscaras e mensagens de erro; consultas com React Query.
- Ajuste do menu em `src/components/app-layout.tsx` e das permissões em `src/lib/auth-context.tsx`.
