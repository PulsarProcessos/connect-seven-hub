insert into public.dre_grupos (nome, natureza, ordem, ativo, fixo) values
  ('Receita Bruta','receita',1,true,true),
  ('Deduções da Receita','despesa',2,true,true),
  ('Outras Receitas','receita',3,true,true),
  ('Custo das Mercadorias','despesa',4,true,true),
  ('Despesas com Pessoal','despesa',5,true,true),
  ('Despesas Operacionais','despesa',6,true,true),
  ('Despesas Administrativas','despesa',7,true,true),
  ('Despesas Financeiras','despesa',8,true,true),
  ('Impostos e Taxas','despesa',9,true,true),
  ('Investimentos','despesa',10,true,true)
on conflict do nothing;

insert into public.dre_categorias (id_grupo, nome, ordem, ativo, fixo, id_loja)
select g.id, x.nome, x.ordem, true, true, null
from (values
  ('Receita Bruta','Vendas à vista',1),
  ('Receita Bruta','Vendas no cartão',2),
  ('Receita Bruta','Vendas financiadas',3),
  ('Receita Bruta','Vendas de serviços',4),
  ('Deduções da Receita','Devoluções e cancelamentos',1),
  ('Deduções da Receita','Descontos concedidos',2),
  ('Outras Receitas','Rendimentos financeiros',1),
  ('Outras Receitas','Outras entradas',2),
  ('Custo das Mercadorias','Compra de mercadorias',1),
  ('Custo das Mercadorias','Frete sobre compras',2),
  ('Despesas com Pessoal','Salários',1),
  ('Despesas com Pessoal','Encargos e benefícios',2),
  ('Despesas com Pessoal','Comissões',3),
  ('Despesas com Pessoal','Pró-labore',4),
  ('Despesas Operacionais','Aluguel',1),
  ('Despesas Operacionais','Condomínio e IPTU',2),
  ('Despesas Operacionais','Energia elétrica',3),
  ('Despesas Operacionais','Água',4),
  ('Despesas Operacionais','Internet e telefonia',5),
  ('Despesas Operacionais','Manutenção e limpeza',6),
  ('Despesas Operacionais','Segurança',7),
  ('Despesas Administrativas','Contabilidade',1),
  ('Despesas Administrativas','Software e sistemas',2),
  ('Despesas Administrativas','Material de escritório',3),
  ('Despesas Administrativas','Marketing e publicidade',4),
  ('Despesas Administrativas','Viagens e deslocamentos',5),
  ('Despesas Financeiras','Taxas de cartão',1),
  ('Despesas Financeiras','Tarifas bancárias',2),
  ('Despesas Financeiras','Juros e multas',3),
  ('Despesas Financeiras','Empréstimos e financiamentos',4),
  ('Impostos e Taxas','Simples Nacional / DAS',1),
  ('Impostos e Taxas','ICMS',2),
  ('Impostos e Taxas','Outros tributos',3),
  ('Investimentos','Obras e reformas',1),
  ('Investimentos','Equipamentos e móveis',2)
) as x(grupo, nome, ordem)
join public.dre_grupos g on g.nome = x.grupo
on conflict do nothing;