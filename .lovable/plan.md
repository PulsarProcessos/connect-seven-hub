## Reestruturação do Cadastro de Lojas

Aplicar em 3 passos, na ordem:

### 1. Migration V4 (banco)
Executar via `supabase--migration` o SQL entregue:
- Enum `tipo_socio` (`propria` | `franqueado`)
- Tabela `public.tipos_loja` (lista livre, com RLS: SELECT autenticado, ALL admin) + seed de 4 tipos (Loja de Shopping, Loja de Rua, Quiosque, Franquia)
- Em `public.lojas`: adiciona `razao_social`, `tipo_socio`, `id_tipo_loja` (FK → `tipos_loja`), índices
- Backfill: `tipo_socio='propria'` e `razao_social=nome_fantasia` onde nulos
- NOT NULL em `razao_social`, `tipo_socio`, `nome_fantasia`, `cnpj`
- **Remove** coluna `tipo` (matriz/filial)
- View `vw_lojas` com labels resolvidos (`security_invoker=true`)
- Passo 6 (carga das 20 lojas por CNPJ) fica **comentado** conforme entregue — só executo se você pedir.

### 2. Regenerar types
Após a migration aprovada, os `types.ts` são regerados automaticamente. Não vou sobrescrever com o arquivo enviado — o pipeline oficial já reflete o novo schema.

### 3. Frontend
Substituir `src/routes/_authenticated/lojas.tsx` pelo arquivo entregue em `user-uploads://lojas.tsx` (592 linhas). Ele traz:
- Colunas: Tipo Sócio (badge roxo/âmbar) · CNPJ · Razão Social · Nome Loja · Tipo de Loja · Status · Ações
- Busca (nome fantasia / razão social / CNPJ) + filtros Tipo Sócio e Tipo de Loja (com "Sem tipo definido")
- Form com obrigatórios marcados, Tipo de Loja opcional ("— Não definido")
- Botão "Tipos de loja" → modal de gestão (add / ativar-desativar / remover, com tratamento de duplicidade e FK)
- Bloqueio para não-admin mantido

### Impacto no resto do app
Nenhuma outra tela precisa mudar: `nome_fantasia` foi preservado, e os seletores de loja (Vendas, Extrato, Conciliação, Alertas, Usuários, Dashboard, auth-context) continuam usando esse campo. A coluna removida `tipo` não é lida em nenhum outro arquivo além do próprio `lojas.tsx`.

### Observações
- **Razão social provisória**: lojas existentes ficarão com `razao_social = nome_fantasia` até você editar pela tela ou rodar o passo 6.
- **Tipo sócio padrão**: todas viram `propria`; passo 6 corrige os 8 franqueados.
- Se quiser, no fim posso descomentar e rodar o passo 6 num segundo `supabase--insert` para popular as 20 lojas da planilha — me avise.

Confirma para eu executar?
