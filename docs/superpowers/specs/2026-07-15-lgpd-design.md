# V10-A — LGPD — Design

**Data:** 2026-07-15
**Marco:** V10 do gap analysis v1.3 — *"Conformidade com a LGPD: base legal por tratamento, consentimentos,
direitos do titular e relatório de dados por cliente."* Pré-requisito de comercialização.

---

## 1. O eixo honesto

A LGPD dá ao titular o direito de exclusão, mas a lei fiscal **obriga** o escritório a guardar boa parte
dos dados por anos. O sistema **não pode fingir que apaga o que é obrigado a reter**. Por isso a exclusão é
**anonimização dos dados pessoais não-fiscais**, com o esqueleto fiscal preservado e o **motivo da retenção
documentado** (base legal: obrigação legal, CC/CTN). É o que a ANPD espera ver.

O titular protegido pela LGPD é **pessoa física**. Como os clientes são majoritariamente PJ, o dado pessoal
que o sistema guarda é o das pessoas por trás: **representante/sócios** (nome, CPF), **contatos** (e-mail,
telefone), **usuários do portal** e a **equipe**. Dado de PJ (razão social, CNPJ) não é dado pessoal.

## 2. Entregas

### 2.1 Relatório de dados por titular (direito de acesso + portabilidade)

Dado um cliente, reúne **tudo** que o sistema guarda sobre ele e as pessoas ligadas: cadastro,
representante/sócios, `clientes_financeiro`, documentos, NFS-e, títulos e baixas, e-mails
(`email_mensagem`), comunicados (`comunicado_destinatario`), acessos ao portal (`portal_acesso`),
solicitações, tarefas. Sai em **dois formatos** (decisão do usuário):

- **PDF** legível (Gotenberg, reusando `htmlParaPdf` de `src/lib/contrato/gerar.ts`) — o direito de **acesso**;
- **JSON** estruturado — o direito de **portabilidade** (o titular leva para outro sistema).

Admin-only. Cada geração é **registrada** (quem gerou, quando) — a prova de que a solicitação foi atendida.

### 2.2 Registro de tratamentos (ROPA), pré-semeado

`lgpd_tratamento`: finalidade, categorias de dado, **base legal** (LGPD art. 7/11), prazo de retenção,
ativo. **Pré-semeado** (decisão do usuário) com os típicos de um escritório contábil:

| Tratamento | Base legal (art. 7) |
|---|---|
| Dados cadastrais do cliente | execução de contrato (V) |
| Escrituração contábil e fiscal | obrigação legal (II) |
| Folha de pagamento | obrigação legal (II) |
| Emissão de NFS-e | obrigação legal (II) |
| Cobrança de honorários | execução de contrato (V) |
| Comunicados e avisos | consentimento (I) |
| Atendimento (WhatsApp/e-mail) | legítimo interesse (IX) |

O escritório edita. Escrita admin-only.

### 2.3 Registro de consentimento

`lgpd_consentimento_evento`: cada mudança de `aceita_comunicados` (e futuros consentimentos) vira um evento
— titular (cliente), tipo, valor (concedido/revogado), origem, quem alterou, quando. Hoje só temos o
**estado atual**; a LGPD pede a **prova histórica**. A action `setAceitaComunicados` passa a gravar o evento
(via service_role — o titular não forja o próprio consentimento).

### 2.4 Exclusão/anonimização com trava de retenção

`lgpd_solicitacao_titular`: registra o pedido (cliente, tipo = acesso | exclusão, data, status, desfecho).

No pedido de **exclusão**, o fluxo:
1. calcula o **veredito de retenção**: o cliente tem NFS-e, títulos, documentos ou obrigações **dentro do
   prazo de guarda** (`escritorio_config.retencao_meses`, padrão 60)? Se sim, o esqueleto fiscal é **retido**;
2. **anonimiza os dados pessoais NÃO-fiscais** (decisão do usuário — nunca apaga o que a lei obriga guardar):
   - `clientes`: `email`, `telefone`, `responsavel_nome`, `representante` → marcador `[anonimizado]`;
   - usuários do portal daquele cliente: desativados e com nome/e-mail anonimizados;
   - o CPF/nome do representante que **aparece em documento fiscal** é **retido** (é obrigação legal);
3. gera a **resposta documentada** ao titular (PDF): o que foi anonimizado, o que foi retido e a base legal;
4. registra tudo em `lgpd_solicitacao_titular` (irreversível — a anonimização não se desfaz).

**Anonimização, não `DELETE`:** os registros fiscais continuam, só deixam de apontar para pessoa
identificável. A regra de "o que é fiscal" fica numa função pura, testada.

## 3. Banco — `0096_lgpd.sql`

```sql
create type lgpd_base_legal as enum
  ('consentimento','contrato','obrigacao_legal','legitimo_interesse','protecao_credito','exercicio_direitos');
create type lgpd_solic_tipo as enum ('acesso','exclusao');
create type lgpd_solic_status as enum ('aberta','concluida');

create table lgpd_tratamento (
  id uuid primary key default gen_random_uuid(),
  finalidade text not null,
  categorias text not null,
  base_legal lgpd_base_legal not null,
  retencao text,               -- descrição livre do prazo ("5 anos após o exercício")
  ativo boolean not null default true,
  ordem int not null default 0
);

create table lgpd_consentimento_evento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null,          -- 'comunicados' (extensível)
  concedido boolean not null,
  origem text,                 -- 'ficha', 'portal', 'importacao'
  usuario_id uuid references usuarios(id),
  criado_em timestamptz not null default now()
);

create table lgpd_solicitacao_titular (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  tipo lgpd_solic_tipo not null,
  status lgpd_solic_status not null default 'aberta',
  retido jsonb,                -- o que foi retido e a base legal
  anonimizado jsonb,           -- o que foi anonimizado
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table escritorio_config add column if not exists retencao_meses int not null default 60;
alter table escritorio_config add column if not exists lgpd_encarregado text;  -- DPO (texto, por ora)
```

**RLS admin-only** nas três tabelas (dado de conformidade, sensível). O evento de consentimento é gravado
pelo servidor (service_role) — o titular não forja o próprio consentimento.

## 4. Código

```
src/lib/lgpd/
  tratamentos-seed.ts   catálogo pré-semeado do ROPA
  anonimizacao.ts       (puro) camposAnonimizaveis(), ehFiscal(), marcador
  retencao.ts           (puro) dentroDaRetencao(dataSaida, meses, hoje), vereditoRetencao(...)
  relatorio.ts          monta o objeto do relatório do titular (as seções)
src/app/(app)/lgpd/
  page.tsx              painel: tratamentos, solicitações, config (retenção, encarregado)
  tratamentos/…         CRUD do ROPA
  actions.ts            gerarRelatorio (PDF+JSON), abrirSolicitacao, anonimizar
src/app/(app)/clientes/[id]/  seção "LGPD" (relatório do titular + pedido de exclusão)
```

**Testes** (a regra é o que erra): `dentroDaRetencao` (limite exato do mês, cliente sem data de saída = em
atividade = retém); `vereditoRetencao` (tem título recente → retém; nada fiscal → libera); `camposAnonimizaveis`
(nunca inclui CNPJ/razão social; inclui e-mail/telefone/representante); o relatório reúne as seções esperadas.

RLS: contador/assistente/financeiro **não** leem as tabelas LGPD (só admin); o cliente do portal não vê nada.

## 5. Menu e navegação

Item **LGPD** em Configurações (admin). Na ficha do cliente, seção **LGPD** com "Gerar relatório de dados" e
"Registrar pedido de exclusão".

## 6. Fora desta fatia

Encarregado/DPO como papel de sistema (por ora, campo de texto); integração com a ANPD (não há API pública);
consentimento granular por canal além de comunicados (extensível pela mesma tabela).

## 7. Entrega

`0096` → lint/typecheck/test/build → deploy. Validar: conferir o ROPA semeado; gerar o relatório de um
cliente (PDF + JSON) e conferir que traz o cadastro, documentos, títulos e e-mails; registrar um pedido de
exclusão num cliente **inativo** e conferir que o e-mail/telefone viram `[anonimizado]` mas a razão
social/CNPJ e os títulos permanecem, com a resposta documentada.

**Versão:** `v6.1.0` (feature).
