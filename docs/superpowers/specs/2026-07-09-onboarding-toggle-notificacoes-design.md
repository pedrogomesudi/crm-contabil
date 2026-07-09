# Onboarding — interruptor de notificações de prazo — Design

**Data:** 2026-07-09
**Marco:** dar ao admin um interruptor, em Configurações do onboarding, para ligar/desligar os alertas de
prazo in-app (badge no menu + tela `/onboarding/alertas`).

**Contexto:** os alertas de prazo do onboarding são **in-app** e hoje sempre ativos: `contarAlertas()`
(badge no Sidebar, via `layout.tsx`) e `listarAlertas()` (tela `/onboarding/alertas` + link em
`/onboarding`), em `src/app/(app)/onboarding/alertas-actions.ts`, gated por `podeCriarCliente`. Não há
tabela de config do onboarding. A página `Configurações → Template de onboarding`
(`/configuracoes/onboarding`) é admin-only e hoje só lista os templates (`GerenciadorTemplates`).

## Decisão (do brainstorming)

Interruptor sobre os alertas **existentes** (badge + tela). Sem push novo.

## Escopo

- Migration: singleton `onboarding_config` (`alertas_ativos`).
- Actions: obter/definir o flag; `contarAlertas`/`listarAlertas` respeitam-no.
- UI: interruptor na config do onboarding + aviso na tela de alertas quando desligado.

## Dados — migration `0060_onboarding_config.sql`

```sql
create table if not exists onboarding_config (
  id int primary key default 1,
  alertas_ativos boolean not null default true,
  atualizado_em timestamptz not null default now(),
  constraint onboarding_config_singleton check (id = 1)
);
alter table onboarding_config enable row level security;
drop policy if exists onboarding_config_sel on onboarding_config;
create policy onboarding_config_sel on onboarding_config for select using (true);
drop policy if exists onboarding_config_upd on onboarding_config;
create policy onboarding_config_upd on onboarding_config for update using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
insert into onboarding_config (id) values (1) on conflict (id) do nothing;
```
Leitura liberada (o badge/alertas precisam ler; flag não sensível); escrita só admin. Row semeada.

## Actions — `src/app/(app)/onboarding/alertas-actions.ts`

```ts
export async function obterAlertasAtivos(): Promise<boolean>;
export async function definirAlertasAtivos(ativo: boolean): Promise<{ ok?: boolean; erro?: string }>;
```
- `obterAlertasAtivos`: lê `onboarding_config.alertas_ativos` (id=1) pelo client de sessão; retorna
  `Boolean(data?.alertas_ativos ?? true)` (padrão ligado).
- `definirAlertasAtivos`: gate **admin** (`perfil.papel === "admin"`); `update onboarding_config set
  alertas_ativos, atualizado_em` where id=1; `revalidatePath("/configuracoes/onboarding")` e `/onboarding`.
- **`contarAlertas`:** no início, após o gate atual, `if (!(await obterAlertasAtivos())) return 0;`.
- **`listarAlertas`:** após o gate, `if (!(await obterAlertasAtivos())) return [];`.

## UI

### Interruptor — `src/app/(app)/configuracoes/onboarding/ToggleAlertas.tsx` (client)
Props `{ ativoInicial: boolean }`. Um checkbox/switch "Notificações de prazo"; ao mudar chama
`definirAlertasAtivos(novo)`; em erro, `alert` e reverte; sucesso → `router.refresh()`.

### Config do onboarding — `configuracoes/onboarding/page.tsx`
Carrega `obterAlertasAtivos()` e renderiza um bloco **"Notificações de prazo"** com o `ToggleAlertas`
**acima** da lista de templates.

### Tela de alertas — `configuracoes`… `/onboarding/alertas/page.tsx`
Carrega `obterAlertasAtivos()`; se `false`, exibe um aviso *"Notificações de prazo desativadas nas
configurações."* acima da lista (que, com o flag off, virá vazia).

## Tratamento de erros
- `definirAlertasAtivos` sem ser admin → `{ erro: "Sem permissão." }`.
- Sem row de config (não deve ocorrer — semeada) → `obterAlertasAtivos` devolve `true` (padrão).

## Testes
- **Smoke (Vitest):** `ToggleAlertas` renderiza nos estados ligado/desligado sem lançar.
- Gate do flag em `contarAlertas`/`listarAlertas`: coberto por `typecheck`/`build`.

## Migrations
`0060_onboarding_config.sql` (tabela singleton + RLS + seed).
