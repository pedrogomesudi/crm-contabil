# Observabilidade — alertar quando algo quebra (RNF-07, fatia 1) (design)

## Objetivo

Parar de "operar às cegas": **registrar erros server-side** num lugar consultável e **ser avisado
quando um cron parar de rodar**. Primeira fatia do RNF-07, escolhida por maior valor (saber que
quebrou antes do cliente reclamar). Não cobre logs estruturados nem métricas.

## Contexto (do que existe)

- **`/api/health`** devolve só `{status, versao}` — não checa dependências.
- **Zero ferramental** de observabilidade (sem Sentry/pino/OTel). ~19 `console.error/warn` vão para o
  stdout do container (log do EasyPanel), por tenant, sem agregação nem busca.
- **7 crons** (`gerar-obrigacoes`, `followup-proposta`, `tarefas-recorrentes`, `entregar-webhooks`,
  `regua-cobranca`, `sincronizar-boletos`, `monitorar-receita`) em `src/app/api/cron/*/route.ts`:
  retornam JSON no sucesso, 401 se não autorizado, 500 se estourar — **ninguém é avisado** se falharem
  ou pararem de rodar.
- **Next 16** tem `instrumentation.ts` com `export const onRequestError` (estável desde v15) —
  dispara quando o servidor Next captura um erro não tratado (route handler / server component /
  server action). Assinatura: `onRequestError(error: {digest:string}&Error, request: {path, method,
  headers,…}, context: {routerKind, routePath, routeType, renderSource, revalidateReason,
  renderType})`. Roda em Node e Edge — o `proxy.ts` do projeto pode ser Edge, então o insert (Node-only)
  precisa **pular o runtime edge**.
- Projeto usa `src/` → o arquivo é `src/instrumentation.ts`.
- `createAdminSupabase()` (service_role) para escrever ignorando RLS; migrations via
  `npm run db:migrate`; próximo número: **`0129`**.

## Decisões (do brainstorm)

- **Abordagem híbrida:** captura **caseira no Supabase** (erros → tabela + painel) + **dead-man switch
  externo** (healthchecks.io) para os crons.
- **Erros: só registrar** (sem alerta push) — revisados no painel. O alerta ativo vem do dead-man
  switch dos crons (healthchecks.io avisa por e-mail quando um ping some).
- **Duas fatias:** A (registro + painel, com migration) · B (dead-man switch dos crons, sem migration).

## Fatia A — Registro de erros server-side + painel

### Migration `0129_evento_erro.sql`

```sql
create table if not exists evento_erro (
  id         uuid primary key default gen_random_uuid(),
  criado_em  timestamptz not null default now(),
  mensagem   text not null,
  rota       text,
  metodo     text,
  digest     text,
  tipo_rota  text,        -- context.routeType (render|route|action…)
  stack      text,        -- cortado (ver helper)
  contexto   jsonb        -- {routerKind, renderSource, revalidateReason,…}
);
create index if not exists idx_evento_erro_criado on evento_erro(criado_em desc);
alter table evento_erro enable row level security;
-- Leitura só admin; escrita é via service_role (o onRequestError insere fora da sessão do usuário),
-- então NÃO há policy de insert para authenticated.
drop policy if exists evento_erro_sel on evento_erro;
create policy evento_erro_sel on evento_erro for select to authenticated using (auth_papel() = 'admin');
```

### Helper puro `src/lib/observabilidade/eventoErro.ts`

`montarEventoErro(err, request, context, agoraISO)` → objeto pronto para insert:
- `mensagem`: `err.message` (ou `"(sem mensagem)"`), cortada em 2000 chars.
- `rota`: `request.path ?? null`; `metodo`: `request.method ?? null`.
- `digest`: `err.digest ?? null`.
- `tipo_rota`: `context.routeType ?? null`.
- `stack`: `err.stack ?? null`, cortada em 6000 chars.
- `contexto`: `{ routerKind, routePath, renderSource, revalidateReason, renderType }` (só os presentes).
- Tipos frouxos (`unknown`/parciais) porque a origem é a borda do Next; a função é defensiva (nunca
  lança). `agoraISO` entra por parâmetro (determinístico p/ teste); no insert, o default do banco
  cobre `criado_em`, então o helper **não** inclui `criado_em`.

### `src/instrumentation.ts`

```ts
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return; // insert é Node-only
  try {
    const { montarEventoErro } = await import("@/lib/observabilidade/eventoErro");
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    const linha = montarEventoErro(err, request, context, new Date().toISOString());
    await createAdminSupabase().from("evento_erro").insert(linha);
  } catch {
    // best-effort: logar erro não pode derrubar o request.
  }
};
```
(Imports dinâmicos dentro do handler: mantêm o módulo de instrumentação leve e evitam puxar o client
admin no bundle de edge.)

### Painel `/configuracoes/observabilidade`

- Server page, gate admin (`getPerfilAtual` + `papel === 'admin'`, senão `redirect("/")`).
- Lê via `createAdminSupabase` os últimos ~100 eventos (`order criado_em desc`).
- Renderiza tabela: **quando** (data/hora), **rota**, **método**, **mensagem** (truncada), **digest**;
  a `stack` fica num `<details>` expansível por linha. Vazio → EmptyState ("Nenhum erro registrado").
- Card **"Observabilidade"** no hub `configuracoes/page.tsx` (desc: "Erros do sistema registrados,
  para diagnóstico. Só admin."). A rota é alcançável pela regra `POR_HUB` de `rotas-alcancaveis`.

### Testes (Fatia A)

- `montarEventoErro` (puro): mensagem/rota/método/digest/tipo mapeados; corte de mensagem e stack;
  campos ausentes viram `null`/omitidos; nunca lança com entrada malformada (`{}` como err/request).
- Render do painel: cabeçalhos e uma linha de exemplo; EmptyState quando lista vazia.

## Fatia B — Dead-man switch dos crons

### Helper `src/lib/observabilidade/healthcheck.ts`

- Puro: `urlDoHealthcheck(mapaJson: string | undefined, nome: string, estado: "success" | "fail"): string | null`
  — parseia `mapaJson` (JSON `{ [cron]: urlBase }`); se ausente/inválido ou sem `nome`, retorna `null`;
  senão `urlBase` (success) ou `urlBase + "/fail"`. Testável.
- I/O: `async pingHealthcheck(nome, estado = "success"): Promise<void>` — resolve a URL via
  `urlDoHealthcheck(process.env.HEALTHCHECK_URLS, nome, estado)`; `null` → no-op; senão `fetch(url,
  { method: "POST" })` com timeout curto, **best-effort** (try/catch, nunca lança — um ping não pode
  quebrar o cron).

### Envolver os 7 crons

Cada `route.ts` de cron, ao final do trabalho bem-sucedido, chama `await pingHealthcheck("<nome>")`;
se o trabalho estourar, chama `await pingHealthcheck("<nome>", "fail")` e re-lança (para o 500 e o
`onRequestError` continuarem valendo). `<nome>` = o slug do cron (ex.: `"gerar-obrigacoes"`).

### Config / operação

- Env `HEALTHCHECK_URLS` (JSON), ex.: `{"gerar-obrigacoes":"https://hc-ping.com/<uuid>", …}`. Sem o
  env, os pings são no-op (comportamento inalterado).
- Você cria um check por cron no healthchecks.io (com o período esperado) e cola as URLs no env. O
  healthchecks.io **avisa por e-mail** quando um ping esperado não chega → "cron parou".

### Testes (Fatia B)

- `urlDoHealthcheck`: mapa válido → url de success e `/fail`; mapa ausente/JSON inválido/nome
  desconhecido → `null`.

## Fora de escopo (desta fatia)

- Alertas push de erro (só registro).
- Retenção/limpeza da `evento_erro` (uma limpeza periódica fica para depois; hoje a tabela cresce).
- Logs estruturados, métricas, tracing, health "profundo" (checar banco/integrações no `/api/health`),
  captura de erros **client-side** (`global-error.tsx`).

## Sequência de entrega

| Fatia | Entrega | Migration |
|---|---|---|
| A | `evento_erro` + `onRequestError` + painel `/configuracoes/observabilidade` | sim (`0129`) |
| B | dead-man switch dos crons (healthchecks.io) | — |

Cada fatia é uma release; esta spec é a fonte comum e cada fatia ganha seu plano na hora de executar.
