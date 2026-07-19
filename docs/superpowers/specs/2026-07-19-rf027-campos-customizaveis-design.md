# RF-027 — Campos customizáveis por escritório — Design

**O que é:** deixar o escritório **definir campos extras** no cadastro do cliente (nome, tipo de dado e
obrigatoriedade) que aparecem **no próprio formulário** de cadastro — um campo obrigatório **bloqueia o
salvar**. Subsistema de metadados independente do RF-026. **Duas fatias**; tem migration.

## Escopo (decidido no brainstorm)

- **Cinco tipos:** texto, número, data, sim/não (booleano) e **lista de opções** (o escritório define as opções).
- **Valores em jsonb no próprio cliente** — os campos servem para **registrar e ver na ficha**; sem filtrar/
  relatar por eles (isso empurraria para armazenamento normalizado, fora de escopo).
- **Integrados ao formulário de cadastro** (criar + editar): o campo marcado obrigatório **impede salvar** o
  cliente sem preenchê-lo, validando junto com o resto.

## O estado de hoje (medido)

- O cadastro é um `clienteSchema` **fixo** (Zod, `src/lib/validation/cliente.ts`); `endereco`/`representante`
  são jsonb montados à parte na action. **Não há** sistema de campos customizados.
- `FormCliente` (`src/components/FormCliente.tsx`) serve criar (`modo="novo"`) e editar (`modo="editar"`), via
  `criarCliente`/`atualizarCliente` (`src/app/(app)/clientes/actions.ts`).
- Há um hub `/configuracoes` com sub-telas por assunto (`legalizacao`, `funil`, `followup`, …). O guard
  `rotas-alcancaveis` cobre `/configuracoes/*` pelo **hub** (`r.startsWith("/configuracoes/")`) — uma nova
  sub-tela **não** entra no `POR_SUBNAV`; basta ser linkada no hub `/configuracoes/page.tsx`.
- Padrões reusáveis: `moverNaOrdem` (reordenar por setas, ex.: `configuracoes/funil/EtapasFunil.tsx`), RLS de
  config leitura-equipe/escrita-admin (padrão da `0103`), `controleCls` (`@/components/ui/Campo`), `Botao`
  (`@/components/ui/Botao`), guard `divida-ui` (controles sem `border` à mão).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Tipos suportados | texto, número, data, booleano, **lista** | Cobrem o cadastro contábil; lista padroniza respostas. |
| Armazenamento dos valores | **jsonb `clientes.campos_custom`** (`{ "<campo_id>": valor }`) | Decidido: só registrar/ver; jsonb é o mais simples. |
| Catálogo das definições | tabela `campo_custom` | Uma linha por campo; ordem/ativo/obrigatório configuráveis. |
| Onde aparecem | **dentro do `FormCliente`** (seção "Informações complementares") | Decidido: obrigatório bloqueia o salvar. |
| Quem define | **admin**, em `/configuracoes/campos-custom` | Padrão das outras configs. |
| Campo desativado | `ativo=false` esconde do form, **mantém** valores gravados | Sem perda de dado ao aposentar um campo. |
| Reordenar | por **setas** (`moverNaOrdem`) | Igual às demais configs; sem drag. |

## Arquitetura

### O modelo de dados (migration 0109)

```sql
create table if not exists campo_custom (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('texto','numero','data','booleano','lista')),
  obrigatorio boolean not null default false,
  opcoes text[],            -- usado só quando tipo = 'lista'
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table clientes add column if not exists campos_custom jsonb not null default '{}'::jsonb;

alter table campo_custom enable row level security;
drop policy if exists campo_custom_read  on campo_custom;
drop policy if exists campo_custom_write on campo_custom;
create policy campo_custom_read  on campo_custom for select using (auth_papel() in ('admin','assistente','contador'));
create policy campo_custom_write on campo_custom for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

`clientes.campos_custom` herda a RLS de `clientes` (quem edita o cliente grava os valores).

### A lógica pura (`src/lib/clientes/campos-custom.ts`)

O núcleo testável — validar e normalizar os valores crus do form contra o catálogo:

```ts
export type CampoTipo = "texto" | "numero" | "data" | "booleano" | "lista";
export type CampoDef = { id: string; nome: string; tipo: CampoTipo; obrigatorio: boolean; opcoes: string[] };

// Lê os valores crus (por campo id), valida obrigatoriedade + tipo, devolve o jsonb normalizado
// ou a 1ª mensagem de erro. Considera apenas os campos passados em `defs` (os inativos não entram).
export function validarCampos(
  defs: CampoDef[],
  crus: Record<string, string>,
): { ok: true; valores: Record<string, unknown> } | { erro: string };
```

Regras por tipo:
- `texto`: trim; vazio → ausente (ou erro se obrigatório).
- `numero`: `Number(...)`; rejeita não-numérico ("Campo *X* deve ser um número").
- `data`: valida calendário real (reusa `ehDataValida` do `clienteSchema` — extrair para um util compartilhado).
- `booleano`: `"on"`/presente → `true`; ausente → `false` (booleano obrigatório = precisa estar marcado).
- `lista`: exige valor ∈ `opcoes` ("Opção inválida para *X*").
- Obrigatório vazio (qualquer tipo, exceto o `false` do booleano opcional) → erro citando o `nome`.

Sai o objeto `{ "<campo_id>": valorNormalizado }` só com os campos preenchidos.

### A integração no formulário (`FormCliente` + actions)

- `FormCliente` recebe `camposCustom: CampoDef[]` e os `valores` atuais (de `cliente.campos_custom`). Renderiza
  uma seção "Informações complementares" com um controle por campo, na ordem do catálogo, nomeados
  `custom_<id>`: `input` (texto), `input type=number` (número), `input type=date` (data), `checkbox` (booleano),
  `select` das `opcoes` (lista). Controles via `controleCls` (sem `border` à mão). Campo obrigatório recebe a
  marca visual "*".
- `criarCliente`/`atualizarCliente`: carregam os campos ativos do catálogo, extraem os `custom_*` do `formData`,
  chamam `validarCampos`. Em erro → devolvem `{ erro }` (não salvam). Em sucesso → gravam
  `campos_custom = valores` no insert/update, junto com o resto do payload. Assim o **obrigatório bloqueia** e a
  validação de tipo acontece server-side, no mesmo caminho da validação atual.

### A tela de configuração (`/configuracoes/campos-custom`, admin)

CRUD do catálogo no padrão das outras configs (admin-gated):
- Listar os campos por `ordem`; adicionar (nome, tipo, `opcoes` quando `lista`, `obrigatorio`); reordenar com
  `moverNaOrdem` (setas ↑/↓); ativar/desativar; remover.
- Actions em `src/app/(app)/configuracoes/campos-custom/actions.ts` (gate admin). Link a partir do hub
  `/configuracoes/page.tsx`.

## Fatias de implementação

- **Fatia A — catálogo + preenchimento (validação de tipo).** Migration (`campo_custom` + `campos_custom` +
  RLS); `validarCampos` (lógica pura + testes); tela de config (definir os 5 tipos, reordenar, ativar/remover);
  `FormCliente` renderiza e grava os valores (criar + editar) com validação de **tipo**; release.
- **Fatia B — obrigatoriedade.** O `obrigatorio` passa a **bloquear** o salvar (erro server-side citando o
  campo) e ganha a marca visual "*" no form; release. Camada fina sobre A.

Cada fatia é shippável e testável sozinha (na A, campos obrigatórios ainda salvam vazios; a B fecha isso).

## Verificação

- **Lógica testável:** `validarCampos` — cada tipo (número não-numérico, data inválida, lista fora das opções,
  booleano marcado/não), obrigatório vazio (erro citando o nome), campo ausente do catálogo ignorado, saída
  jsonb só com preenchidos.
- **Form:** render de `FormCliente` com campos dinâmicos (um por tipo) sem `border` à mão (guard `divida-ui`);
  o valor atual pré-preenche na edição.
- **Config:** CRUD admin-gated; reordenar por setas; desativar esconde do form mas mantém o valor.
- **Não-regressão:** `lint`, `typecheck`, `test`, `format:check`, `build`; guard `rotas-alcancaveis`
  (a nova sub-tela é coberta pelo hub `/configuracoes/*` — link no hub, sem entrada em `POR_SUBNAV`); migration
  idempotente e **aplicada em produção antes do deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Filtrar/relatar clientes por campo custom | Decidido: só registrar/ver na ficha (jsonb, não normalizado). |
| Campos custom no wizard de constituição (`FormConstituicao`) | Fica no cadastro padrão (`novo`/`editar`); o wizard é fluxo à parte. |
| Campos custom em outras entidades (proposta, tarefa, etc.) | RF-027 é do cadastro do cliente. |
| Reordenar por drag-and-drop | Padrão do projeto é por setas (`moverNaOrdem`). |
| Migrar/retroagir obrigatoriedade a clientes antigos | Só bloqueia ao salvar aquele cliente; não retroage. |

## Riscos

| Risco | Mitigação |
|---|---|
| Campo obrigatório criado depois deixa clientes antigos "incompletos" | Só bloqueia ao **editar/salvar** aquele cliente; o dado antigo permanece até a próxima edição. |
| Apagar um campo com valores gravados | Preferir `ativo=false` a delete; se deletar, a chave órfã no jsonb do cliente é inofensiva (ignorada por não estar no catálogo). |
| Renomear/trocar o tipo de um campo com valores | O valor guardado é por `campo_id` (não por nome), então renomear é seguro; trocar o tipo pode invalidar valores antigos na próxima edição — aceitável (o operador revê). |
| `opcoes` de `lista` alteradas depois | Um valor antigo fora das novas opções só é barrado na próxima edição daquele cliente; exibição na ficha mostra o valor gravado. |
