# RNF-01 — Maturidade do multi-tenant físico: ferramenta de status (design)

## Contexto e decisão

O SALDO já é multi-tenant por **isolamento físico** (1 projeto Supabase + 1 container por
escritório), modelo deliberado e mais seguro (`docs/DEPLOY.md`). O RNF-01 "multi-tenant lógico"
(banco compartilhado + coluna tenant + RLS por tenant) foi avaliado e **descartado** por ser a
arquitetura oposta à construída e a de maior risco do backlog (112 tabelas, 206 policies, 131
usos de `service_role` que bypassam RLS — cada um um ponto de vazamento cross-tenant).

Decisão: **manter o isolamento físico** e amadurecer a operação em volta. Das melhorias
levantadas:
- **Provisionamento robusto (B):** já coberto — `scripts/tenant-novo.mjs` tem `--retomar`,
  `--dry-run`, recuperação por `--project-ref` e checklist manual final. Nada a fazer.
- **Self-service (C):** adiado (não há backend central no modelo físico).
- **Registro/status + verificação pós-release (A + D):** **a lacuna real** — não há visibilidade
  consolidada dos escritórios nem checagem de "quem já implantou a versão nova".

Esta spec entrega A + D numa ferramenta só.

## Objetivo

Uma ferramenta de operador que lista os escritórios e mostra a versão no ar e a saúde de cada
um, sinalizando quem está fora do ar ou desatualizado após um release.

## Arquitetura

### 1. Helper puro — `scripts/_tenant-status.mjs`

Funções puras (JS, testáveis por vitest):

- `compararVersao(a, b): number` — compara semver `x.y.z` (retorna <0, 0, >0). Tolera prefixo
  `v` e partes ausentes.
- `classificar({ ok, versao }, esperado): string` — devolve o status textual:
  - sem resposta (`ok === false`) → `"fora do ar"`;
  - com `esperado` e `compararVersao(versao, esperado) < 0` → `"desatualizado"`;
  - com `esperado` e `>= 0` → `"atualizado"`;
  - sem `esperado` → `"ok"`.
- `resumo(linhas): { total, fora, desatualizados }` — conta para o rodapé e o exit code.

### 2. CLI — `scripts/tenant-status.mjs`

- Lê o registry via `lerRegistry()` de `scripts/_tenants.mjs` (array de
  `{ slug, nome, appUrl }`; tolera as duas formas — array direto ou `{ escritorios: [...] }`).
- Aceita `--esperado <versao>` (opcional) e `--timeout <ms>` (default 8000).
- Para cada escritório, `fetch(`${appUrl}/api/health`)` com `AbortController`; extrai `versao`;
  em erro/timeout marca `ok: false`. As consultas rodam em paralelo (`Promise.all`).
- Imprime uma tabela: **slug · appUrl · versão · status**. Rodapé com o resumo.
- **Exit code:** `0` se todos ok/atualizados; `1` se houver algum `fora do ar` ou
  `desatualizado` (permite usar em checagem automática pós-release).
- Não imprime segredo algum (só metadados públicos do registry + a versão do `/api/health`).

### 3. Wiring

- `package.json`: `"tenant:status": "node scripts/tenant-status.mjs"`.

## Testes

`src/tests/scripts/tenant-status.test.ts` (importa o helper `.mjs` por caminho relativo):
- `compararVersao`: `6.63.0 > 6.62.0`; igual → 0; tolera `v6.63.0`; `6.9.0 < 6.10.0`.
- `classificar`: sem resposta → `"fora do ar"`; versão < esperada → `"desatualizado"`;
  versão ≥ esperada → `"atualizado"`; sem `esperado` → `"ok"`.
- `resumo`: conta fora do ar e desatualizados corretamente.

## Fora de escopo

Multi-tenant lógico (descartado); self-service de onboarding (adiado); qualquer alteração no
`tenant-novo`/`tenant-doctor` (já robustos); painel web (a ferramenta é CLI de operador, pois o
app por-tenant não enxerga os demais).
