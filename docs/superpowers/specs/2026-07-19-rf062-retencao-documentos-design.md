# RF-062 (retenção por tipo + alertas de expurgo) — Design

**O que é:** dar ao GED uma **política de retenção por tipo de documento** e **alertar** os documentos que
passaram do prazo (vencidos), para **revisão e expurgo manual** — sem apagar nada automaticamente. Fecha o
RF-062. **Uma fatia; tem migration.**

## O estado de hoje (medido)

- Retenção só **global**: `escritorio_config.retencao_meses` (default 60) + descrições textuais na LGPD.
  Lógica pura reusável: `dentroDaRetencao(base, meses, hoje)` em `src/lib/lgpd/retencao.ts`.
- `tipo_documento` (RF-060): `id, nome, departamento, ordem, ativo` — **sem** retenção.
- `documentos`: tem `competencia` (date, RF-060) e `enviado_em`. Exclusão: `excluirDocumento` (admin-only,
  registra no log de acesso — RF-063). Busca central: `/documentos` (RF-061).
- Padrão de **badge** no menu: obrigações têm o badge de riscos (`0067`), computado e passado a `menuDoPapel`.
- `pg_cron` existe (não usado aqui — expurgo é manual).

## Escopo (decidido no brainstorm)

- **Retenção por tipo** (no catálogo `tipo_documento`), com fallback ao global.
- **Base da retenção = competência** (fallback `enviado_em`).
- **Alerta = revisão manual + badge**; **sem apagar automático** (expurgo é ação do admin).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Prazo por tipo | `tipo_documento.retencao_meses` (nullable = global) | Reusa o catálogo do RF-060; um prazo por tipo. |
| Base do cálculo | `competencia` quando há; senão `enviado_em` | Alinha ao prazo legal (fato gerador). |
| Onde calcular | **view** `documento_retencao` (`security_invoker`) | Fonte única do `vence_em`; respeita a RLS. |
| Alerta | badge no menu + tela de revisão | Decidido; pull-based, sem push. |
| Expurgo | **manual** (admin), reusa `excluirDocumento` | Destrutivo; nada some sozinho. |

## Arquitetura

### Modelo de dados (migration 0114)

```sql
alter table tipo_documento add column if not exists retencao_meses int;  -- null = usa o global

-- Calcula quando cada documento "vence" a retenção. security_invoker => respeita a RLS de documentos.
create or replace view documento_retencao with (security_invoker = true) as
select
  d.id, d.cliente_id, d.nome, d.tipo, d.tipo_id, d.competencia, d.enviado_em, d.substitui_id,
  coalesce(td.retencao_meses, ec.retencao_meses) as meses_retencao,
  (coalesce(d.competencia, d.enviado_em::date)
     + (coalesce(td.retencao_meses, ec.retencao_meses) || ' months')::interval)::date as vence_em
from documentos d
left join tipo_documento td on td.id = d.tipo_id
cross join (select retencao_meses from escritorio_config where id = 1) ec;
```

- Base = `competencia` (já é o 1º dia do mês) ou `enviado_em::date`; prazo = `tipo.retencao_meses` ou o global.
  `vencido` = `vence_em < current_date`.
- `security_invoker = true` faz a view rodar sob a RLS do usuário (Postgres 15+ do Supabase) — cada um só vê os
  documentos que já enxerga.
- Idempotência: `add column if not exists` + `create or replace view`.

### Lógica pura (`src/lib/documentos/retencao.ts`)

O cálculo da data mora na view (fonte única). No app, o testável é a **exibição** da regra na config:
```ts
export function mesesEfetivos(tipoMeses: number | null, global: number): number;       // tipoMeses ?? global
export function descreverRetencao(tipoMeses: number | null, global: number): string;   // "24 meses" | "60 meses (padrão)"
```

### Alerta (badge) + tela de revisão + expurgo

- **Badge:** contador de documentos vencidos no item **"Documentos"** do menu (molde do badge de riscos):
  `select count(*) from documento_retencao where vence_em < current_date` — só para quem gerencia documentos
  (admin/assistente/contador; financeiro só lê). Computado no carregamento dos badges (como os demais) e passado
  a `menuDoPapel`.
- **Tela `/documentos/retencao`** (gate admin): lista os vencidos (nome · cliente · tipo · competência ·
  **vence_em** · quanto tempo vencido), ordenados por `vence_em` (mais antigo primeiro), `limit(100)`, com
  **baixar** e **expurgar** por linha. O expurgo reusa `excluirDocumento` (admin-only, com confirmação) — que já
  remove o objeto do storage e registra no log de acesso.
- **Banner** no topo de `/documentos` (RF-061): "N documentos vencidos — revisar" com link para a tela de
  retenção (só quando N > 0 e o usuário é admin).

### Config (retenção por tipo)

A tela `/configuracoes/tipos-documento` ganha, por tipo, um campo **"Retenção (meses)"** (vazio = usa o
global). Reusa `TiposDocumentoLista`; nova action `definirRetencaoTipo(id, meses | null)`. O formulário de criar
tipo também aceita a retenção opcional.

## Fatia de implementação

Uma fatia: migration 0114 (coluna + view) + `mesesEfetivos`/`descreverRetencao` (com testes) + a action de
retenção no catálogo + o campo na config + a tela `/documentos/retencao` (lista + expurgo) + o badge + o banner
em `/documentos` + release.

## Verificação

- **Lógica testável:** `mesesEfetivos` (tipo vence o global; null cai no global) e `descreverRetencao`.
- **View:** um documento com competência antiga + prazo curto aparece como vencido; com prazo longo, não;
  o prazo do **tipo** sobrepõe o global; documento sem competência usa `enviado_em`. (verificação por consulta/
  `db:test`.)
- **Tela/badge:** a lista mostra só vencidos e ordena por `vence_em`; o badge conta o mesmo conjunto; o expurgo
  remove o documento (reaproveita a exclusão admin) e some da lista.
- **Não-regressão:** guard `divida-ui` (controles via `controleCls`) e `rotas-alcancaveis` (`/documentos/retencao`
  alcançável); `lint`/`typecheck`/`test`/`format:check`/`build`; migration idempotente e **aplicada em produção
  antes do deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Expurgo automático (cron apaga) | Decidido: destrutivo; só manual. |
| Alerta por e-mail periódico (cron) | Não escolhido; o badge + a tela cobrem o alerta pull. |
| Retenção a partir do encerramento do contrato | Usa a competência/envio do documento; encerramento é outro eixo. |
| Retenção dos documentos enviados pelo cliente (portal) tratada à parte | A regra vale para todos os documentos do cliente igualmente. |

## Riscos

| Risco | Mitigação |
|---|---|
| Expurgo apaga acervo legal | Só admin, com confirmação; nada automático; reusa a exclusão que registra no log (RF-063). |
| Prazo mal configurado marca demais/de menos | O admin revisa a lista antes de apagar; o badge é só um indicador. |
| View pesada em base grande | `limit(100)` na tela; o count é uma agregação simples; volume atual é baixo. |
| `security_invoker` não aplicado (Postgres antigo) | Supabase é Postgres 15+; a verificação confere que a view respeita a RLS. |
