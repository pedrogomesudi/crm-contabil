# Obrigações e Compliance — Fatia 3A (Escalonamento hierárquico) — Design

**Data:** 2026-07-09
**Marco:** RF-035 (alertas escalonados colaborador → líder → sócio) do módulo de Obrigações. Constrói
sobre as Fatias 1 (matriz + calendário) e 2 (baixa + painel de riscos), ambas em produção.

**Contexto:** `obrigacao_instancia` (status pendente/dispensada, entrega derivada de `entregue_em`,
`responsavel_id` = contador do cliente, `vencimento_interno`). `usuarios` (id = auth.uid, nome, email,
papel, ativo). Padrões reaproveitados: config singleton `onboarding_config` (toggle admin, RLS
select-all/update-admin); `classificarRisco`/painel de riscos (Fatia 2); badge no Sidebar via
`layout.tsx` → `contarAlertas`/`contarRiscos`; `createAdminSupabase` para leitura que contorna RLS.

**Decisões de brainstorming:**
- **Hierarquia real:** campo `superior_id` no usuário (colaborador → líder → sócio). Sem e-mail
  transacional nem push: o escalonamento é **in-app**, numa página dedicada.
- **Toggle + limiares configuráveis** pelo admin (ligar/desligar; dias para líder e para sócio;
  padrões 7 e 15).
- **Página separada** `/obrigacoes/escalonamento` com **badge próprio** no menu.
- **Leitura contorna a RLS por-cliente** (via `createAdminSupabase`), filtrando pela cadeia
  hierárquica no código — é a intenção do escalonamento (a liderança enxerga o time), controlada pela
  aplicação.

**Escopo desta fatia:** hierarquia de usuários + escalonamento por tempo + toggle/limiares + página +
badge. **Fora (Fatia 3B):** suspensão de inativos + retroativos (RF-036) e relatório de conformidade
(RF-037).

## 1. Modelo de dados — migration `0063_obrigacao_escalonamento.sql` (idempotente)

- **`usuarios`:** `alter table usuarios add column if not exists superior_id uuid references usuarios(id);`
  (nullable, auto-referência). Cadeia: responsável → líder (`superior_id`) → sócio (`superior_id` do
  líder). Sócio = topo (superior nulo).
- **`obrigacao_config`** (singleton, padrão `onboarding_config`):
  ```sql
  create table if not exists obrigacao_config (
    id int primary key default 1,
    escalonamento_ativo boolean not null default false,
    dias_lider int not null default 7,
    dias_socio int not null default 15,
    atualizado_em timestamptz not null default now(),
    constraint obrigacao_config_singleton check (id = 1)
  );
  alter table obrigacao_config enable row level security;
  drop policy if exists obrigacao_config_sel on obrigacao_config;
  create policy obrigacao_config_sel on obrigacao_config for select using (true);
  drop policy if exists obrigacao_config_upd on obrigacao_config;
  create policy obrigacao_config_upd on obrigacao_config for update
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
  insert into obrigacao_config (id) values (1) on conflict (id) do nothing;
  ```

**Hierarquia na gestão de usuários** (`/usuarios`, admin): action `definirSuperior(usuarioId,
superiorId | null)` (gate admin) — **proteção contra ciclo**: partindo de `superiorId`, sobe pela cadeia
(`superior_id`); se reencontrar `usuarioId` (ou o próprio = ele mesmo), rejeita com erro. Grava
`usuarios.superior_id`.

## 2. Cálculo + carga

**Helper puro `src/lib/obrigacoes/escalonamento.ts` (TDD):**
```ts
export type NivelEscalonamento = 0 | 1 | 2; // 0 nenhum · 1 líder · 2 sócio
export function nivelEscalonamento(diasAtraso: number, diasLider: number, diasSocio: number): NivelEscalonamento;
export type Cadeia = { liderId: string | null; socioId: string | null };
export function escaladoParaUsuario(nivel: NivelEscalonamento, cadeia: Cadeia, usuarioId: string): boolean;
```
- `nivelEscalonamento` — `diasAtraso ≥ diasSocio → 2`; `diasAtraso ≥ diasLider → 1`; senão `0`.
  (Assumindo `diasSocio ≥ diasLider`; se o admin inverter, `≥ diasSocio` ainda vence primeiro.)
- `escaladoParaUsuario` — `(nivel ≥ 1 && cadeia.liderId === usuarioId) || (nivel ≥ 2 && cadeia.socioId
  === usuarioId)`. Sócio nulo → nível 2 permanece visível ao líder.

**Action `listarEscalonamento(): Promise<ItemEscalado[]>`** (gate `podeCriarCliente`), em
`obrigacoes/escalonamento-actions.ts`:
```ts
export type ItemEscalado = { id: string; clienteNome: string; obrigacaoNome: string; vencimentoInterno: string; diasAtraso: number; nivel: 1 | 2; responsavelNome: string | null };
```
- Lê `obrigacao_config`. Se `escalonamento_ativo = false` → `[]`.
- Via `createAdminSupabase`: carrega `usuarios (id, nome, superior_id)` → mapa `id → { superiorId, nome }`;
  para cada responsável, `cadeia = { liderId: superior, socioId: superior do superior }`. Carrega
  `obrigacao_instancia` `status='pendente'` e `entregue_em is null` e `vencimento_interno < hoje`, com
  `responsavel_id`, `obrigacao(nome)`, `clientes(razao_social)`. Para cada item:
  `diasAtraso = diffDiasUTC(vencimento_interno, hoje)`; `nivel = nivelEscalonamento(diasAtraso,
  diasLider, diasSocio)`; inclui **só** os itens com `escaladoParaUsuario(nivel, cadeia, perfil.id)`.
  Ordena por `diasAtraso` desc.
- **`contarEscalonamento(): Promise<number>`** — mesma lógica, retorna a contagem (0 se off ou sem
  permissão). Reaproveita internamente `listarEscalonamento` (ou uma consulta espelhada).

> `diffDiasUTC(a, b)` = `(Date.parse(b) − Date.parse(a)) / 86400000` (dias inteiros; datas ISO
> `YYYY-MM-DD` em UTC). Pode ficar num util local do módulo.

## 3. UI

**Página `/obrigacoes/escalonamento/page.tsx`** (server, gate `podeCriarCliente` → `redirect("/")`) +
`EscalonamentoView.tsx` (client):
- Recebe `itens: ItemEscalado[]` e `ativo: boolean`. Se `!ativo` → aviso "Escalonamento desativado nas
  configurações." e nada mais.
- Tabela dos itens escalados para mim: cliente, obrigação, vencimento interno, **dias de atraso**,
  **responsável original**, selo do **nível** (`líder`/`sócio`, sócio em vermelho). Ordenada por atraso.
  Vazio → "Nada escalado para você."

**Badge + item no Sidebar** — `layout.tsx`: `const escalonamento = podeCriarCliente(perfil.papel) ?
await contarEscalonamento() : 0;` passado ao `<Sidebar escalonamento={escalonamento} />`. Em
`Sidebar.tsx`: novo item **"Escalonamento"** → `/obrigacoes/escalonamento` (gate `podeCriarCliente`),
logo abaixo de "Obrigações", com `badge: escalonamento || undefined`.

**Toggle + limiares (admin)** — em `/configuracoes/obrigacoes` (topo), seção **"Escalonamento de
atrasos"**: checkbox **ativo** + campos numéricos **"escala ao líder após N dias"** / **"ao sócio após M
dias"**. Actions em `configuracoes/obrigacoes/actions.ts`: `obterConfigEscalonamento(): Promise<{ ativo:
boolean; diasLider: number; diasSocio: number }>` (qualquer autenticado; usado pela página server) e
`salvarConfigEscalonamento(input)` (gate admin). Componente client `ConfigEscalonamento.tsx` renderizado
no topo da página da matriz.

**Seletor de superior** — na tela `/usuarios`, cada linha ganha um `<select>` "Superior" (opções = demais
usuários ativos + "— nenhum —") chamando `definirSuperior`; recarrega ao salvar. Action em
`usuarios/actions.ts`.

## 4. Testes

- **Unit `escalonamento.test.ts`:** `nivelEscalonamento` nas fronteiras (atraso 6→0, 7→1, 14→1, 15→2 com
  7/15); `escaladoParaUsuario` (líder vê nível ≥1; sócio vê nível 2; sócio nulo não quebra e nível 2 fica
  no líder; quem não está na cadeia não vê).
- **Smoke:** `EscalonamentoView` renderiza um item escalado (cliente + responsável + selo de nível) e o
  aviso quando `ativo=false`; `ConfigEscalonamento` renderiza o checkbox e os dois campos.

## 5. Tratamento de erros / bordas
- Escalonamento off → `listarEscalonamento`/`contarEscalonamento` retornam `[]`/0 (badge some).
- Sócio inexistente (líder sem superior) → item de nível 2 permanece visível ao líder.
- Responsável nulo → sem cadeia, não escala.
- Ciclo na hierarquia → `definirSuperior` rejeita (inclui o caso superior = si mesmo).
- Sem permissão → `redirect`/`[]`/0.

## 6. Migrations
`0063_obrigacao_escalonamento.sql` — `usuarios.superior_id`; `obrigacao_config` singleton + RLS + linha
padrão. Sem alteração de enum.
