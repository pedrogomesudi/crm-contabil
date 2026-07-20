# Suspensão de serviços por inadimplência com trava e alçada — Design

**Data:** 2026-07-20
**Módulo:** Financeiro
**RF:** Suspensão de serviços por inadimplência com trava e alçada

## Contexto

Hoje o sistema deriva inadimplência (título com `vencimento < current_date` e saldo > 0)
mas não age sobre ela: não há flag de cliente inadimplente persistida, não há tolerância
de dias, e o valor de enum `contrato_status = 'SUSPENSO'` existe desde a migration 0028 mas
**nunca é escrito** — é um valor morto. Falta o gatilho, a trava efetiva e a alçada para liberar.

Esta feature adiciona: (1) suspensão por cliente com histórico auditável; (2) uma fila de
"sugeridos para suspensão" derivada de parâmetros configuráveis; (3) cessação de faturamento
ao suspender (contratos `ATIVO → SUSPENSO`); (4) trava granular no portal do cliente; (5) alçada
segregada — `financeiro` suspende, apenas `admin` reativa.

Reusa o padrão de alçada entregue na v6.35 (`escritorio_config.alcada_pagamento` + função pura
`requerAprovacao`/`podeAprovar` + estado na entidade + trava na ação + gate admin).

## Decisões de design

1. **Trava = cessar faturamento + bloquear portal (granular).** Ao suspender: contratos vão a
   `SUSPENSO` (para a geração de mensalidades, que já filtra `status='ATIVO'`) **e** o portal
   bloqueia os entregáveis (documentos, notas, guias, abertura de nova solicitação), mantendo
   **visíveis os boletos e a situação financeira** para o cliente conseguir se regularizar.
2. **Gatilho híbrido — o sistema sinaliza, a pessoa confirma.** A fila de sugeridos é uma consulta
   derivada (não um estado persistido nem um cron). A suspensão é sempre um clique deliberado.
   O cron de alerta proativo fica como fatia futura (depende do `CRON_SECRET`, ainda a rotacionar).
3. **Alçada segregada.** `financeiro` (e `admin`) suspende; **apenas `admin` reativa** — desfazer a
   trava sem quitação é a decisão sensível. Reativação exige motivo registrado.
4. **Suspensão por cliente; contratos como consequência.** O cliente é a unidade inadimplente e a
   unidade bloqueada no portal. Os contratos são efeito colateral do estado do cliente.
5. **Piso de valor configurável.** `suspensao_valor_minimo` evita sugerir suspensão por diferença
   trivial (arredondamento). `null` = sem piso. `suspensao_dias_tolerancia` null/0 = feature desligada.
6. **Reativação por quitação é sugerida, não automática.** Cliente que zera a dívida aparece como
   sugestão de reativar; o clique continua sendo do admin (evita reativar sobre pagamento parcial).

## Arquitetura

### Modelo de dados (migration idempotente nova, ex. `0117_suspensao_inadimplencia.sql`)

```sql
-- estado corrente (barato para RLS e UI)
alter table clientes add column if not exists suspenso boolean not null default false;

-- trilha de auditoria append-only
create table if not exists cliente_suspensao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  acao          text not null check (acao in ('suspensao','reativacao')),
  motivo        text not null,
  saldo_devedor numeric(15,2),
  dias_atraso   int,
  por           uuid references usuarios(id),
  em            timestamptz not null default now()
);
create index if not exists idx_cliente_suspensao_cliente on cliente_suspensao(cliente_id, em desc);

-- parâmetros (null/0 = desligado; null = sem piso)
alter table escritorio_config add column if not exists suspensao_dias_tolerancia int;
alter table escritorio_config add column if not exists suspensao_valor_minimo numeric(15,2);
```

RLS de `cliente_suspensao`: leitura para a equipe (`auth_papel()` em admin/contador/assistente/financeiro),
escrita para `podeGerenciarFinanceiro` (admin/financeiro) — a segregação suspender/reativar é feita na
action, não na policy (a policy só garante que a equipe financeira grava). Idempotente
(`drop policy if exists ... ; create policy ...`).

### Lógica pura — `src/lib/financeiro/suspensao.ts`

```ts
export const elegivelSuspensao = (
  diasAtraso: number,
  saldoDevedor: number,
  diasTolerancia: number | null,
  valorMinimo: number | null,
): boolean =>
  diasTolerancia != null && diasTolerancia > 0 &&
  diasAtraso >= diasTolerancia &&
  saldoDevedor > 0 &&
  (valorMinimo == null || saldoDevedor >= valorMinimo);

export const podeSuspender = (papel: string): boolean =>
  papel === "admin" || papel === "financeiro";

export const podeReativar = (papel: string): boolean => papel === "admin";
```

### Ações — server actions (Fatia A)

- `listarSuspensao()` → devolve três coleções derivadas: `sugeridos` (inadimplentes elegíveis
  não suspensos), `suspensos` (suspenso=true), `reativaveis` (suspenso=true e sem saldo vencido).
  Cada item traz cliente, saldo devedor, dias de atraso.
- `suspenderCliente(clienteId, motivo)` — gate `podeSuspender`; motivo obrigatório (não vazio).
  Marca `clientes.suspenso=true`; `update contrato set status='SUSPENSO' where cliente_id=? and status='ATIVO'`;
  insere `cliente_suspensao(acao='suspensao', saldo, diasAtraso, por=perfil.id)`. Revalida a rota.
- `reativarCliente(clienteId, motivo)` — gate `podeReativar` (admin); motivo obrigatório.
  `clientes.suspenso=false`; `update contrato set status='ATIVO' where cliente_id=? and status='SUSPENSO'`;
  insere `cliente_suspensao(acao='reativacao', por=perfil.id)`. Revalida a rota.
- `carregarConfigSuspensao()` / `salvarConfigSuspensao(formData)` — leitura pela equipe; escrita
  admin-only via `createAdminSupabase()` (padrão da tela de alçada de pagamento).

### Telas (Fatia A)

- **`/financeiro/inadimplencia`** (rota nova; gate `podeGerenciarFinanceiro`; registrar em
  `src/lib/ui/navegacao.ts` para o guard `rotas-alcancaveis`). Três blocos: Sugeridos (botão
  Suspender → modal/inline pedindo motivo), Suspensos (quem/quando/motivo; botão Reativar
  habilitado só para admin), Suspensos sem pendência (sugestão de reativar).
- **Config** dos parâmetros (dias de tolerância + piso) agrupada em `/configuracoes/pagamento`,
  admin-only, ao lado da alçada de pagamento.

### Trava do portal (Fatia B)

Defesa em profundidade — RLS + UI.

**Banco** — função `auth_cliente_suspenso()` (security definer, stable), retorna `clientes.suspenso`
do `auth_cliente_id()`. Recria (idempotente) as policies portal de leitura das superfícies bloqueadas
com `and not auth_cliente_suspenso()`:

| Recurso | Policy | Suspenso |
|---|---|---|
| Documentos | `documentos_portal_sel` | bloqueado |
| Notas fiscais | `nfse_portal_sel` | bloqueado |
| Guias/obrigações | `obrig_portal_sel` | bloqueado |
| Títulos (situação financeira) | `titulo_portal_sel` | liberado |
| Boletos | `boleto_portal_sel` | liberado |
| Solicitações (abrir nova) | policy INSERT | bloqueado |
| Solicitações (ler existentes) | policy SELECT | liberado |

**UI** — o layout/home do portal detecta a suspensão (lê `clientes.suspenso` do cliente logado) e
mostra aviso no topo ("Acesso parcialmente suspenso por pendência financeira — regularize os boletos
abaixo para reativar"). As páginas bloqueadas (documentos/notas/guias) renderizam tela de estado
suspenso em vez de lista vazia. Boletos e situação financeira seguem normais, com destaque.

## Fatiamento

- **Fatia A — núcleo:** schema, lógica pura, actions suspender/reativar/config, tela
  `/financeiro/inadimplencia`, config de parâmetros. Entrega: suspender já **para o faturamento**
  e registra auditoria; portal ainda não bloqueado.
- **Fatia B — trava do portal:** `auth_cliente_suspenso()`, recriação das policies RLS, gates de UI.
  Depende de A.

## Fora de escopo (fatias futuras)

- Cron de alerta proativo ("N clientes prontos para suspensão") — depende da rotação do `CRON_SECRET`.
- Reativação automática por quitação (mantida como sugestão manual por decisão de design).
- Notificação ao cliente por e-mail na suspensão/reativação.

## Testes

- `src/tests/financeiro/suspensao.test.ts` — `elegivelSuspensao` (dentro/fora do prazo,
  abaixo/acima do piso, piso null, tolerância null/0 = desligado, saldo zero), `podeSuspender` e
  `podeReativar` por papel (admin/financeiro/contador/assistente/cliente).
- Teste de render (`renderToStaticMarkup`) da tela de inadimplência: botão Reativar presente só
  para admin; ação Suspender exige motivo.
- Fatia B: teste de render dos gates do portal (página bloqueada mostra aviso; boletos visíveis).
- RLS validado por `npm run db:test` quando houver Session pooler; senão coberto por revisão da policy.

## Constraints do projeto (herdadas)

- Next 16 App Router; imports via `@/*`; `next/image`; segredos server-only.
- Papel via `usuarios.papel` / `auth_papel()` — nunca do JWT/`app_metadata`.
- Migrations imutáveis após aplicadas; novas idempotentes; aplicadas por `npm run db:migrate`.
- Guards de UI: inputs sem `border` estático (usar `controleCls`); sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.
