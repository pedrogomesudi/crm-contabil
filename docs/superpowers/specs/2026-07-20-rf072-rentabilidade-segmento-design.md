# RF-072 — Rentabilidade por segmento (regime e porte) — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Rentabilidade) + Cadastro do cliente

## Contexto

A rentabilidade **por cliente** já existe (`src/lib/timesheet/rentabilidade.ts` +
`financeiro/rentabilidade/actions.ts` + tela + export): horas apontadas × custo/hora vigente × recebido ×
contratado, com margem R$/%. Falta o RF-072: agrupar os **mesmos números por segmento** — **regime
tributário** (já existe no cliente) e **porte** (não existe; será criado). A "atividade" (CNAE) fica fora
por ser granular demais.

Esta entrega adiciona um **seletor de agrupamento** (Cliente / Regime / Porte) na tela de rentabilidade,
e um campo **porte** no cadastro do cliente.

## Decisões

1. **Dimensões:** regime tributário (existe) e porte (novo). Atividade/CNAE fora de escopo.
2. **Porte = 4 faixas oficiais:** `MEI`, `ME`, `EPP`, `DEMAIS`. Campo **opcional** (null = "Não classificado").
3. **Seletor de agrupamento** na mesma tela (Cliente / Regime / Porte); o export acompanha o agrupamento.
4. **Agregação é lógica pura:** soma horas/custo/recebido/contratado por grupo, margem calculada por grupo.
   Cliente sem o atributo cai em "Não classificado".

## Arquitetura

### Fatia A — agrupamento por regime (zero schema)

**Tipo** — estender `LinhaRentab` (`src/lib/timesheet/rentabilidade.ts`) com `regime: string | null`.

**Ação** — em `financeiro/rentabilidade/actions.ts`, o select de `clientes` passa a incluir
`regime_tributario`; cada `LinhaRentab` recebe `regime`.

**Lógica pura de agregação** — `src/lib/timesheet/segmento.ts`:
```ts
export type GrupoRentab = { grupo: string; minutos: number; custo: number; recebido: number; contratado: number };
export function agruparRentabilidade(
  linhas: { minutos: number; custo: number; recebido: number; contratado: number; regime?: string | null; porte?: string | null }[],
  dimensao: "regime" | "porte",
): GrupoRentab[];
// agrupa por linha[dimensao] (null/"" => "Não classificado"), soma os campos, ordena por recebido desc.
```
A margem por grupo reusa `margem(...)` de `rentabilidade.ts` na renderização.

**UI** — `financeiro/rentabilidade/page.tsx` (ou um client component): seletor **"Agrupar por: Cliente /
Regime / Porte"**. Em "Cliente" → tabela atual. Em "Regime"/"Porte" → tabela agrupada (Grupo / Horas /
Custo / Recebido / Contratado / Margem R$ / %), com totais. O `BotaoExportar` monta o `RelatorioExportavel`
conforme o agrupamento escolhido. (Na Fatia A o seletor já lista "Porte", mas todos caem em "Não
classificado" até a Fatia B.)

### Fatia B — campo porte

**Schema** (migration idempotente):
```sql
do $$ begin create type porte_empresa as enum ('MEI','ME','EPP','DEMAIS'); exception when duplicate_object then null; end $$;
alter table clientes add column if not exists porte porte_empresa;
```

**Tipo/ação** — `LinhaRentab` ganha `porte: string | null`; o select de `clientes` na ação de
rentabilidade passa a incluir `porte`.

**UI cadastro** — no `FormCliente.tsx` (aba Cadastro), um `<select name="porte">` (— / MEI / ME / EPP /
Demais) ao lado do regime; a action que salva o cliente persiste `porte` (null quando vazio).

## Testes

- `src/tests/timesheet/segmento.test.ts` — `agruparRentabilidade`: agrupa por regime e por porte; soma
  correta; `null`/`""` → "Não classificado"; ordena por recebido desc.
- Render da tabela agrupada / seletor.
- A ação de rentabilidade (Supabase) e a migration não rodam em teste local; a agregação pura é testada
  isolada.

## Fatiamento

- **Fatia A — agrupamento por regime:** `regime` em `LinhaRentab`, `agruparRentabilidade`, seletor + tabela
  agrupada + export. Zero schema; entrega o valor principal (Simples × Presumido × Real).
- **Fatia B — porte:** migration (enum + coluna), `porte` em `LinhaRentab`, select no `FormCliente` + save,
  Porte ativo no seletor.

## Constraints do projeto (herdadas)

- Rentabilidade é `podeGerenciarFinanceiro`/`podeVerHonorario`; roda via service_role (cruza custo admin-only).
- Migrations imutáveis; nova idempotente. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.

## Fora de escopo

- Agrupar por **atividade/CNAE** (granular demais; exigiria mapear CNAE → grupo).
- Backfill do porte (nasce null; o usuário classifica os clientes aos poucos).
- Segmentação em outros relatórios além da rentabilidade.
