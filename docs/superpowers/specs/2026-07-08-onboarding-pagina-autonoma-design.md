# Onboarding — página autônoma por cliente — Design

**Data:** 2026-07-08
**Marco:** dar ao onboarding de cada cliente uma **página própria** (`/onboarding/[clienteId]`), em vez de
levar para o cadastro completo (onde a seção fica no fim da página).

**Contexto:** hoje a lista `/onboarding` (`ListaProcessos`) e a tela de alertas (`AlertasView`) linkam para
`/clientes/{id}` (cadastro inteiro). O onboarding vive como `ProcessoSection` no fim de
`src/app/(app)/clientes/[id]/page.tsx`, que também busca os dados: `listarProcessoCliente(id)`, usuários
ativos, `listarTemplatesAtivos()` e o `perfilSugerido` (via `sugerirPerfil(tipo, regime, qtd_func)`), além
de `podeRevelarCredencial(papel)`. Rotas atuais em `/onboarding`: `page.tsx` (lista) e `alertas/`.

## Decisões (do brainstorming)

1. Nova rota autônoma `/onboarding/[clienteId]` que mostra **só o onboarding** do cliente.
2. **Mover** a seção do cadastro para a página autônoma; no cadastro fica apenas um **link "Abrir
   onboarding"**.

## Escopo

- Nova rota `/onboarding/[clienteId]` (server) renderizando a `ProcessoSection` com cabeçalho do cliente.
- Ajustar os links de `ListaProcessos` e `AlertasView` para a nova rota.
- Remover a `ProcessoSection` (e a busca dos dados dela) de `clientes/[id]/page.tsx`, deixando um link.
- **Sem migration, sem tabela, sem mudança na `ProcessoSection` nem nas actions.**

Fora do escopo: qualquer mudança de comportamento do onboarding em si.

## Rota — `src/app/(app)/onboarding/[clienteId]/page.tsx` (server)

- Gate `podeCriarCliente` (senão `redirect('/')`).
- Lê o cliente: `clientes` → `id, razao_social, tipo_pessoa, regime_tributario, excluido_em` (via
  `createServerSupabase`, sujeito à RLS — contador só os seus). Se não achar → `notFound()`.
- Busca os dados do onboarding (mesma lógica de hoje na ficha):
  - `const proc = await listarProcessoCliente(id)`;
  - usuários ativos: `supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome")`;
  - templates: `await listarTemplatesAtivos()`;
  - `perfilSugerido`: `sugerirPerfil(tipo_pessoa, regime_tributario, qtd_funcionarios)` — lendo
    `clientes_financeiro.qtd_funcionarios` do cliente;
  - `hoje` (fuso SP) e `podeRevelar = podeRevelarCredencial(perfil.papel)`.
- **Cabeçalho:** título com a **razão social**; subtítulo/atalho com link **"Ver cadastro completo"** →
  `/clientes/{id}`. (Usar `PageHeader` com `titulo` + um `Link` de volta.)
- Renderiza `<ProcessoSection ... />` com as mesmas props usadas hoje na ficha
  (`clienteId, processo, itens, progresso, usuarios, podeRevelar, perfilSugerido, hoje, templates`).
- **Sem colisão de rota:** `alertas/` (estático) tem prioridade sobre `[clienteId]` (dinâmico); um id de
  cliente é UUID, nunca "alertas".

## Ajustes de link

- `src/app/(app)/onboarding/ListaProcessos.tsx`: o `<Link>` do nome do cliente passa de
  `/clientes/${o.clienteId}` para `/onboarding/${o.clienteId}`.
- `src/app/(app)/onboarding/alertas/AlertasView.tsx`: o `<Link>` da razão social passa de
  `/clientes/${a.clienteId}` para `/onboarding/${a.clienteId}`.

## Cadastro do cliente — `src/app/(app)/clientes/[id]/page.tsx`

- **Remover** o carregamento do onboarding (as linhas de `proc`, `usuariosOnb`, `templatesOnb`,
  `perfilSugerido`, `hojeOnb`) e o `<ProcessoSection ... />` no JSX, além dos imports agora não usados
  (`ProcessoSection`, `listarProcessoCliente`, `sugerirPerfil`, `listarTemplatesAtivos`).
- **Manter** `podeCriarCliente`/`podeRevelarCredencial` só se ainda usados; senão remover os imports
  órfãos. A exibição da **competência inicial** (campo do cadastro) permanece.
- **Adicionar** um link compacto, visível quando `podeCriarCliente(papel)`:
  ```tsx
  <Link href={`/onboarding/${id}`} className="text-sm text-verde underline">Abrir onboarding</Link>
  ```
  (posicionado junto ao topo, próximo ao nome/competência).

## Tratamento de erros
- Sem permissão → `redirect('/')`. Cliente inexistente/sem acesso (RLS) → `notFound()`.
- Cliente sem processo → a `ProcessoSection` já mostra o formulário "Iniciar processo" (sem template
  ativo, mostra o aviso). Nenhuma mudança.

## Testes
- O **smoke da `ProcessoSection`** já cobre o componente. A nova página é wiring (server component) —
  coberta por `npm run build` (compila a rota) e `typecheck`. Sem novo teste unitário.

## Migrations
Nenhuma.
