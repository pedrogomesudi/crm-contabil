# Responsáveis por departamento (RF-025) — Design

**Data:** 2026-07-11
**Contexto:** Módulo Clientes. Requisito do gap analysis (RF-025).

## Objetivo

> "Responsáveis internos por departamento (fiscal, pessoal, contábil) por cliente, com redistribuição em massa de carteira."

Permitir designar, por cliente, um **responsável interno por departamento** (Contábil, Fiscal, Pessoal, Societário/Legalização) e **redistribuir a carteira** atribuindo um departamento a vários clientes selecionados de uma vez.

## Estado atual (achados)

- **`usuarios`**: `papel` (admin/contador/assistente/financeiro), `ativo`, `superior_id`. A RLS de `usuarios` só deixa ler a própria linha → listas de colaboradores usam `service_role` (padrão já existente em `listarContadores`).
- **`clientes`**: já tem **`contador_id`** (um único responsável) que **governa a RLS** ("contador só vê os seus"), e `responsavel_nome` (texto livre). Essas policies **não serão alteradas**.
- **`obrigacao_instancia`**: tem `responsavel_id` e `esfera` — conceito distinto de "departamento"; sem integração automática nesta entrega.

## Decisões (brainstorm)

1. **Departamentos fixos:** enum `contabil`, `fiscal`, `pessoal`, `societario` (rótulos: Contábil, Fiscal, Pessoal/Folha, Societário/Legalização).
2. **Camada nova, RLS inalterada:** os responsáveis por departamento são uma camada adicional; `clientes.contador_id` continua governando a visibilidade. Sem reescrita de policies existentes.
3. **Redistribuição por seleção manual:** o admin/assistente filtra a lista de clientes, marca um subconjunto, escolhe departamento + colaborador destino e aplica aos selecionados.

## Modelo de dados (migration nova, idempotente)

```sql
do $$ begin create type departamento as enum ('contabil','fiscal','pessoal','societario');
exception when duplicate_object then null; end $$;

create table if not exists cliente_responsavel (
  cliente_id uuid not null references clientes(id) on delete cascade,
  departamento departamento not null,
  usuario_id uuid not null references usuarios(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) default auth.uid(),
  primary key (cliente_id, departamento)
);
```

- Uma linha por (cliente, departamento); **ausência = sem responsável** (limpar = deletar a linha).
- **RLS:**
  - SELECT: equipe autenticada — `auth_papel() in ('admin','assistente','contador','financeiro')`.
  - INSERT/UPDATE/DELETE: admin/assistente sempre; **contador só nos clientes dele** — `exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid())`.
- Trigger `cliente_responsavel_integridade` seta `atualizado_por = auth.uid()` e `atualizado_em = now()`.

## Componentes e arquivos

### Biblioteca
- **`src/lib/clientes/departamentos.ts`**: `DEPARTAMENTOS: {valor, rotulo}[]` (fonte única de rótulos) + `type Departamento`.
- **`src/lib/clientes/colaboradores.ts`** (server-only): `listarColaboradores()` — usuários ativos com `papel in ('admin','contador','assistente')` (id/nome), via `service_role`; `ehColaboradorValido(id)`.
- **`src/lib/clientes/permissoes.ts`**: `podeGerenciarResponsaveis(papel)` → admin/assistente (gerência total e redistribuição). O contador edita apenas os próprios clientes (validado na action + RLS).

### Ficha do cliente
- Nova seção **"Responsáveis por departamento"** (`src/components/clientes/ResponsaveisDepartamento.tsx`, client): quatro linhas (Contábil/Fiscal/Pessoal/Societário), cada uma com um `<select>` de colaborador (ou "— sem responsável"). Ao mudar, chama a action e faz `router.refresh()`. Read-only quando o usuário não pode editar aquele cliente.
- **`src/app/(app)/clientes/[id]/responsaveis-actions.ts`**:
  - `definirResponsavel(clienteId, departamento, usuarioId | null)` — gate admin/assistente OU contador-dono; valida colaborador; `usuarioId=null` deleta a linha, senão faz upsert. `revalidatePath` da ficha.
- A `page.tsx` da ficha carrega os responsáveis atuais e a lista de colaboradores (quando pode editar) e renderiza a seção.

### Redistribuição de carteira
- Página **`/clientes/responsaveis`** (admin/assistente; redireciona os demais):
  - Filtros: **departamento**, **responsável atual** (select de colaborador, ou "sem responsável"), **busca por nome**.
  - Lista de clientes com **checkbox** e a coluna do responsável atual naquele departamento.
  - Rodapé de ação: **departamento-alvo** + **colaborador destino** (ou "— remover") + botão **"Aplicar aos selecionados"**.
  - `src/app/(app)/clientes/responsaveis/page.tsx` + `RedistribuicaoCarteira.tsx` (client) + `actions.ts`.
- **`atribuirEmMassa(clienteIds[], departamento, usuarioId | null)`** — gate admin/assistente; valida colaborador; upsert (ou delete quando null) para cada cliente. Retorna a contagem afetada.
- **Acesso:** link "Responsáveis por departamento" no cabeçalho da página de Clientes (`/clientes`), visível a admin/assistente. (Sem novo item de menu.)

## Fluxos

**Atribuir na ficha:** ficha → seção Responsáveis → seleciona colaborador no departamento → `definirResponsavel` → upsert/delete.

**Redistribuir:** Clientes → "Responsáveis por departamento" → filtra (ex.: Fiscal + responsável atual = Ana) → marca clientes → destino = Bruno → "Aplicar" → `atribuirEmMassa` reatribui o Fiscal desses clientes para Bruno.

## Testes

- **Unit (`permissoes`/`departamentos`)**: `podeGerenciarResponsaveis` (admin/assistente sim; contador/financeiro não); `DEPARTAMENTOS` cobre os quatro valores do enum.
- **RLS (`rls.test.sql`)**: contador define responsável no **próprio** cliente (efeito) e **não** no de outro contador (sem efeito); admin/assistente definem em qualquer; financeiro não escreve; todos leem.
- Suíte completa (`npm test`, `npm run db:test`, `lint`, `typecheck`) verde antes de cada commit.

## Fora de escopo (YAGNI, futuro)

- Roteamento automático de obrigações/tarefas pelo responsável de departamento.
- Painéis e filtros por departamento/colaborador (o gap analysis prevê, mas em outra frente).
- Solicitações internas entre departamentos com SLA.
- Departamentos configuráveis pelo escritório (hoje fixos; viram tabela se necessário).

## Segurança (preservar)

- Listas de colaboradores via `service_role` server-only, expondo só id/nome (a RLS de `usuarios` não permite listar).
- Escrita de responsável do contador limitada aos clientes dele **na própria RLS** (não só na action).
- `contador_id` e as policies de `clientes`/obrigações/financeiro permanecem intactos.
