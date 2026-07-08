# Onboarding — Ciclo C: alertas de prazo (in-app) — Design

**Data:** 2026-07-08
**Marco:** avisar o escritório sobre itens do onboarding **vencendo** ou **vencidos**, in-app, sem
depender de e-mail/WhatsApp nem do módulo comercial (RF-006).

**Contexto:** `onboarding_processo_item` tem `status` (pendente/concluido/dispensado), `prazo` (date),
`bloqueante`, `responsavel_id` (usuário), `titulo`, `codigo`, `bloco_nome`, `processo_id`. A RLS já
**isola por cliente** (contador só os seus; admin tudo). Sem infra de e-mail transacional no app; padrão
de cron existe mas **não é usado aqui** (alerta in-app é calculado ao vivo). Sidebar recebe `papel`/`nome`
do layout `(app)/layout.tsx`; item "Onboarding" visível para `podeCriarCliente`.

## Decisões (do brainstorming)

1. **Canal: in-app** — tela de alertas + badge no menu. Sem push, sem cron, sem tabela nova.
2. Alerta = item **pendente** com **prazo** vencido ou vencendo na **janela de 3 dias** (ajustável).
3. **Severidade** substitui o "escalonamento": vence em breve / vencido / crítico (vencido há +7 dias);
   cada item mostra o **responsável** para o líder cobrar. Admin vê tudo (RLS); filtro "só os meus".

## Escopo (Ciclo C)

- Helpers puros de classificação/ordenação.
- Actions `listarAlertas` (lista) e `contarAlertas` (badge).
- UI: tela `/onboarding/alertas`, link a partir de `/onboarding`, badge no Sidebar.
- **Sem migration, sem cron, sem tabela.**

Fora do escopo: e-mail/WhatsApp push, cron proativo, oportunidades de consultoria, gatilho comercial (RF-006).

## Helpers puros — `src/lib/onboarding/alertas.ts` (TDD)

```ts
export type SeveridadeAlerta = "em_breve" | "vencido" | "critico";

// Severidade de um prazo (YYYY-MM-DD) relativo a hoje (YYYY-MM-DD). null = ainda fora da janela.
export function classificarAlerta(prazo: string, hoje: string, janelaDias?: number): SeveridadeAlerta | null;

// Peso para ordenar (mais grave primeiro): critico < vencido < em_breve.
export function ordemSeveridade(sev: SeveridadeAlerta): number;
```
Regras (`classificarAlerta`, `janelaDias = 3`):
- `d = dias(prazo − hoje)` (UTC, sem fuso).
- `d > janelaDias` → `null` (ainda não é alerta).
- `d >= 0` → `"em_breve"` (vence hoje ou nos próximos `janelaDias`).
- `d >= -7` → `"vencido"`.
- `d < -7` → `"critico"`.

`ordemSeveridade`: `critico=0`, `vencido=1`, `em_breve=2`.

## Actions — `src/app/(app)/onboarding/alertas-actions.ts`

```ts
export type AlertaView = { itemId: string; clienteId: string; razaoSocial: string; blocoNome: string; codigo: string | null; titulo: string; prazo: string; severidade: SeveridadeAlerta; bloqueante: boolean; responsavelNome: string | null; meu: boolean };

export async function listarAlertas(): Promise<AlertaView[]>;
export async function contarAlertas(): Promise<number>;
```
- Gate `podeCriarCliente` (senão `[]` / `0`).
- `hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })`.
- `listarAlertas`: lê `onboarding_processo_item` com `status = 'pendente'` e `prazo not null` (a RLS
  restringe aos clientes visíveis), trazendo `processo_id`, `bloco_nome`, `codigo`, `titulo`, `prazo`,
  `bloqueante`, `responsavel_id`. Resolve `cliente_id`/`razao_social` (via `onboarding_processo` →
  `clientes`) e o nome do responsável (via `usuarios`). Classifica cada item com `classificarAlerta`;
  descarta os `null`. `meu = responsavel_id === <id do usuário logado>`. Ordena por `ordemSeveridade`
  e, dentro, por `prazo` crescente.
- `contarAlertas`: mesma base, retorna a **contagem** dos que classificam (não-null). Usado no badge.

> Item com só `responsavel_papel` (sem `responsavel_id`) entra em "todos", mas não conta como "meu".

## UI

### Tela — `src/app/(app)/onboarding/alertas/page.tsx` (server) + `AlertasView.tsx` (client)
Gate `podeCriarCliente` (senão redirect). Carrega `listarAlertas()` e passa ao cliente.
- **`AlertasView`**: toggle **"Todos / Só os meus"** (filtra `meu` no cliente); lista **agrupada por
  severidade** (Crítico / Vencido / Vence em breve), cada item: cliente (link para a ficha), bloco +
  código + título, **prazo** (com dias de atraso/para vencer), selo **bloqueante**, responsável.
  Estado vazio: "Nenhum alerta de prazo.".
- Formatação de datas com o helper existente (`formatarData`) ou fatia de string; SALDO tokens
  (crítico/vencido em `text-negativo`, em breve em `text-cinza`/atenção).

### Link e badge
- Em `/onboarding` (lista de processos), um botão/atalho **"Alertas de prazo (N)"** → `/onboarding/alertas`.
- **Sidebar:** `Sidebar` recebe uma prop opcional `alertasOnboarding?: number`; o item "Onboarding"
  mostra um **badge** com a contagem quando `> 0`. O layout `(app)/layout.tsx` busca
  `podeCriarCliente(papel) ? await contarAlertas() : 0` e passa a prop. (Uma consulta leve por
  navegação, só para quem gerencia cliente.)

## Tratamento de erros
- Sem permissão → `[]`/`0` nas actions; redirect na página.
- Item sem prazo ou concluído/dispensado → não é alerta (filtro na query + `classificarAlerta`).
- Prazo futuro além da janela → `null` (não aparece).

## Testes
- **Unit (Vitest):** `classificarAlerta` (fronteiras: hoje, +3, +4→null, −1, −7, −8→critico) e
  `ordemSeveridade`.
- **Smoke:** `AlertasView` renderiza vazio e com alertas (grupos/severidades) sem lançar; o toggle
  "só os meus" filtra.

## Migrations
Nenhuma.
