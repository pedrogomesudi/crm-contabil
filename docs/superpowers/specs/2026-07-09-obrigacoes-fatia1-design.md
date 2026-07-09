# Obrigações e Compliance — Fatia 1 (Matriz + geração do calendário) — Design

**Data:** 2026-07-09
**Marco:** primeira fatia do módulo de **Obrigações e Compliance** (RF-030/031/032) — o único domínio do
produto integralmente não iniciado e a recomendação nº 1 do gap analysis (v1.2). Entrega: "todo cliente
passa a ter um calendário de obrigações gerado automaticamente".

**Contexto:** obrigações são **recorrentes** (mensais/trimestrais/anuais por competência) — reaproveita
a *lógica de aplicabilidade condicional* do motor de onboarding (`itemAplica`, `sugerirPerfil`,
`somarDias`, `classificarAlerta`), mas com um motor próprio de **recorrência + instâncias por
competência**. O cliente já tem `regime_tributario`, `cnae`, `qtd_funcionarios` (extensão financeira),
UF/município (endereço) e `competencia_inicial`.

**Decisões de brainstorming:**
- **Incidência híbrida:** perfis/regime + flags booleanas + filtros opcionais de UF e prefixo de CNAE.
- **Prazos:** dia útil + feriados nacionais (fixos + móveis via Páscoa); prazo interno = N dias úteis
  antes do legal; antecipação para o dia útil anterior.
- **Geração:** pg_cron mensal + botão manual, idempotente por (obrigação, cliente, competência).
- **Matriz:** pré-semeada (starter por regime) + curadoria, semeada por código.
- **Arquitetura:** tabelas novas + helpers puros (padrão onboarding/financeiro).

**Escopo desta fatia:** matriz (CRUD + seed), motor de prazo, motor de incidência/geração, cron,
calendário (global + na ficha do cliente).
**Fora (Fatia 2+):** baixa com comprovante e status *entregue* (RF-033); painel de riscos (RF-034);
alertas escalonados, suspensão/retroativos, relatório de conformidade (RF-035/036/037); flags fiscais
explícitas no cadastro.

## 1. Modelo de dados — migration `0061_obrigacoes.sql` (idempotente)

**Enums:**
- `obrigacao_esfera` = (federal, estadual, municipal, trabalhista)
- `obrigacao_periodicidade` = (mensal, trimestral, anual)
- `obrigacao_instancia_status` = (pendente, dispensada) *(entregue chega na Fatia 2)*

**`obrigacao` (matriz — curada pelo admin):**
- `id uuid pk default gen_random_uuid()`, `codigo text unique not null`, `nome text not null`,
  `descricao text`, `esfera obrigacao_esfera not null`, `periodicidade obrigacao_periodicidade not null`,
  `ativa boolean not null default true`, `ordem int not null default 0`.
- Incidência: `aplicavel_a text[] not null default '{}'` (perfis
  mei/simples_sem_func/simples_com_func/presumido_real/pf), `condicao_flags text[] not null default '{}'`,
  `condicao_modo text not null default 'any'` (any/all), `ufs text[] not null default '{}'`
  (vazio = todas), `cnae_prefixos text[] not null default '{}'` (vazio = todos).
- Prazo: `venc_dia int not null` (1–31; clampado ao fim do mês no cálculo), `venc_mes_offset int not null
  default 1` (mensal/trimestral), `venc_mes int` (anual, 1–12), `venc_ano_offset int not null default 1`
  (anual), `prazo_interno_dias_uteis int not null default 0`, `antecipa boolean not null default true`.
- `criado_em timestamptz not null default now()`.

**`obrigacao_instancia` (gerada por cliente+competência):**
- `id uuid pk default gen_random_uuid()`, `obrigacao_id uuid not null references obrigacao(id)`,
  `cliente_id uuid not null references clientes(id)`, `competencia date not null` (1º dia do período:
  mês/trimestre/ano), `vencimento_legal date not null`, `vencimento_interno date not null`,
  `status obrigacao_instancia_status not null default 'pendente'`,
  `responsavel_id uuid references usuarios(id)`, `criado_em timestamptz not null default now()`.
- **Único:** `(obrigacao_id, cliente_id, competencia)`. Índices por `cliente_id` e por `competencia`.

**RLS:**
- `obrigacao`: `select using(true)`; `insert/update/delete` com `using/with check (auth_papel() = 'admin')`.
- `obrigacao_instancia`: select/insert/update com
  `exists (select 1 from clientes c where c.id = cliente_id)` (a RLS de `clientes` restringe o contador
  aos seus). Sem delete por RLS (limpeza é operacional).

**Origem das flags (derivadas do cadastro):** `tem_folha` = `qtd_funcionarios > 0`; `contribui_icms` =
inscrição estadual preenchida; `contribui_iss` = inscrição municipal preenchida. Perfil via
`sugerirPerfil(tipoPessoa, regime, qtdFuncionarios)` (já existe em `src/lib/onboarding/processo.ts`).
Flags fiscais explícitas no cliente ficam como refinamento futuro.

## 2. Cálculo de prazos — `src/lib/obrigacoes/prazo.ts` (helper puro, TDD)

```ts
export function feriadosNacionais(ano: number): Set<string>;   // "YYYY-MM-DD"
export function ehDiaUtil(iso: string, feriados: Set<string>): boolean;
export function diaUtilAnterior(iso: string, feriados: Set<string>): string;
export function subtraiDiasUteis(iso: string, n: number, feriados: Set<string>): string;
export type RegraPrazo = { periodicidade: "mensal" | "trimestral" | "anual"; vencDia: number; vencMesOffset: number; vencMes: number | null; vencAnoOffset: number; prazoInternoDiasUteis: number; antecipa: boolean };
export function calcularVencimento(regra: RegraPrazo, competencia: string): { legal: string; interno: string };
```

- **`feriadosNacionais(ano)`** — fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 25/12. Móveis
  via **algoritmo de Páscoa (Meeus/Gauss)**: Sexta-feira Santa (Páscoa −2), Carnaval (−47, terça-feira),
  Corpus Christi (+60).
- **`ehDiaUtil`** = não é sábado/domingo e não está em `feriados`. **`diaUtilAnterior`** = recua até o
  dia útil anterior. **`subtraiDiasUteis(iso, n, feriados)`** = recua `n` dias úteis.
- **`calcularVencimento(regra, competencia)`** — `competencia` é ISO (1º dia do período). Deriva a
  data-base:
  - *mensal:* dia `vencDia` do mês da competência **+ `vencMesOffset` meses**.
  - *trimestral:* dia `vencDia` do **mês final do trimestre** da competência + `vencMesOffset`.
  - *anual:* dia `vencDia` / mês `vencMes` do ano da competência **+ `vencAnoOffset`**.
  - `vencDia` **clampado** ao último dia do mês-alvo.
  - Se `antecipa` e a data cair em fim de semana/feriado → `diaUtilAnterior`. Resultado = `legal`.
  - `interno` = `subtraiDiasUteis(legal, prazoInternoDiasUteis, feriados)`.
- Datas manipuladas como string ISO em UTC (sem `Date.now()`/`new Date()` sem argumento no núcleo puro —
  usar `Date.UTC`/componentes).

## 3. Incidência + geração — `src/lib/obrigacoes/geracao.ts` (helper puro) + action + cron

**Helper puro:**
```ts
import type { PerfilCliente } from "@/lib/onboarding/processo";
export type ObrigacaoMatriz = { id: string; periodicidade: "mensal" | "trimestral" | "anual"; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; ufs: string[]; cnaePrefixos: string[]; regra: import("./prazo").RegraPrazo };
export type ClienteFiscal = { perfil: PerfilCliente; uf: string | null; cnae: string | null; flags: Record<string, boolean> };
export type InstanciaSeed = { obrigacaoId: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string };
export function obrigacaoAplica(o: ObrigacaoMatriz, c: ClienteFiscal): boolean;
export function instanciasDaCompetencia(obrigacoes: ObrigacaoMatriz[], c: ClienteFiscal, ano: number, mes: number): InstanciaSeed[];
```

- **`obrigacaoAplica`** — verdadeiro quando: `aplicavelA` contém `c.perfil`; `condicaoFlags` batem por
  `condicaoModo` (`any` = alguma verdadeira; `all` = todas; lista vazia = sempre passa); `ufs` vazio **ou**
  contém `c.uf`; `cnaePrefixos` vazio **ou** algum prefixo é prefixo de `c.cnae`.
- **`instanciasDaCompetencia(obrigacoes, c, ano, mes)`** — para cada obrigação com `obrigacaoAplica`,
  decide se a rodada `(ano, mes)` gera instância, pela periodicidade:
  - *mensal:* sempre → `competencia = ano-mes-01`.
  - *trimestral:* só se `mes ∈ {3,6,9,12}` → `competencia` = 1º dia do trimestre correspondente.
  - *anual:* só se `mes == 1` → `competencia = (ano-1)-01-01` (exercício anterior).
  Cada instância traz `vencimentoLegal`/`vencimentoInterno` via `calcularVencimento(o.regra, competencia)`.

**Action + cron** — `src/app/(app)/obrigacoes/actions.ts`:
- `gerarCompetencia(ano, mes)` — gate `podeCriarCliente`. Carrega `obrigacao` ativas + clientes ativos
  (deriva `ClienteFiscal`: perfil, uf, cnae, flags). Para cada cliente, `instanciasDaCompetencia(...)` e
  **upsert idempotente** por `(obrigacao_id, cliente_id, competencia)` — `on conflict do nothing` (não
  sobrescreve status/responsável já existentes). `responsavel_id` inicial = contador do cliente.
- `gerarCompetenciaCliente(clienteId, ano, mes)` — idem, só para um cliente (botão na ficha).
- **Cron:** `POST /api/cron/gerar-obrigacoes` — Bearer `CRON_SECRET`, `createAdminSupabase()`, chama a
  geração para `(anoAtual, mesAtual)` (timezone SP). Agendado **mensal via pg_cron** (dia 1) como passo
  operacional; **desligado** até a matriz estar revisada.

> **Gates:** geração/instâncias = `podeCriarCliente` (admin/contador/assistente, isolado por cliente na
> RLS). Curadoria da matriz = **admin**.

## 4. UI

- **Matriz (admin)** `/configuracoes/obrigacoes` — lista (código, nome, esfera, periodicidade, incidência
  resumida, ativa) + **CRUD** (identidade, periodicidade, incidência: perfis/flags/UF/prefixos CNAE,
  prazo: dia/offset/mês/interno/antecipa, ativa) no padrão do editor de template do onboarding. Botão
  **"Semear matriz padrão"** (`semearMatrizPadrao`, idempotente por código).
- **Calendário global** `/obrigacoes` (gate `podeCriarCliente`) — filtros (competência mês/ano, cliente,
  status, responsável "todos / só os meus"); lista ordenada por vencimento (cliente, obrigação, rótulo da
  competência derivado da periodicidade — `07/2026`, `1º tri/2026`, `2026`, vencimento interno e legal,
  responsável, **selo de severidade** via `classificarAlerta(vencimentoInterno, hoje)`); botão **"Gerar
  competência"** (admin). Contador só vê os seus clientes (RLS).
- **Ficha do cliente** — seção **"Obrigações"** com as instâncias do cliente + botão "Gerar para este
  cliente".
- **Sidebar** — link **"Obrigações"** (gate `podeCriarCliente`).

## 5. Seed — `src/lib/obrigacoes/seed.ts`

Matriz starter (~9 obrigações), semeada por código (idempotente). Valores iniciais curáveis pelo editor:

| Código | Periodicidade | Incidência | Prazo legal |
|---|---|---|---|
| DASN-SIMEI | anual | perfil mei | 31/05 do ano seguinte |
| PGDAS-D | mensal | perfis simples_* | dia 20 do mês seguinte |
| DEFIS | anual | perfis simples_* | 31/03 do ano seguinte |
| DCTFWeb | mensal | flag tem_folha | dia 20 do mês seguinte |
| FGTS Digital | mensal | flag tem_folha | dia 20 do mês seguinte |
| EFD-Contribuições | mensal | perfil presumido_real | dia 15 do 2º mês seguinte |
| EFD-Reinf | mensal | perfil presumido_real | dia 15 do mês seguinte |
| ECD | anual | perfil presumido_real | 31/05 do ano seguinte |
| ECF | anual | perfil presumido_real | 31/07 do ano seguinte |

## 6. Testes

- **Unit `prazo.test.ts`:** `feriadosNacionais` (fixos + móveis — Páscoa 2026 = 05/04 ⇒ Sexta Santa 03/04,
  Carnaval 17/02, Corpus Christi 04/06); `ehDiaUtil`/`diaUtilAnterior` (pula fds/feriado);
  `subtraiDiasUteis`; `calcularVencimento` (mensal dia 20 mês seguinte; anual 31/05 ano seguinte; clamp de
  dia ao fim do mês; antecipação em fds/feriado; prazo interno em dias úteis).
- **Unit `geracao.test.ts`:** `obrigacaoAplica` (perfil; flags any/all; UF vazia = todas / restrita
  exclui outra; prefixo de CNAE); `instanciasDaCompetencia` (mensal todo mês; trimestral só {3,6,9,12};
  anual só janeiro com competência do exercício anterior; vencimentos calculados).
- **Smoke:** calendário `/obrigacoes` renderiza filtros + uma instância + "Gerar competência"; editor da
  matriz renderiza lista + "Semear matriz padrão".

## 7. Tratamento de erros / bordas
- Sem permissão → `redirect`/`[]`. Cliente sem UF/CNAE → filtros opcionais tratam `null` como "não
  restringe" (incidência por perfil continua valendo).
- Geração idempotente (`on conflict do nothing`): reexecutar não duplica nem sobrescreve
  status/responsável.
- Competência sem obrigações aplicáveis → nada gerado (sem erro).

## 8. Migrations
`0061_obrigacoes.sql` (enums + tabelas + RLS + índices). O agendamento pg_cron é passo operacional
pós-migration (desligado até a matriz ser revisada).
