# Legalização — Fatia B (editor de modelos) — Design

**Data:** 2026-07-12
**Contexto:** Completa a **configurabilidade do RF-012**. A Fatia A entregou o motor + 7 modelos semeados; falta o admin **criar/editar** modelos e suas etapas.

## Objetivo

Tela (admin) para gerenciar os **modelos de legalização**: criar, editar metadados (nome, descrição, tipo, ativo), excluir, e **gerenciar as etapas** de cada modelo (adicionar, editar, remover, reordenar) — os mesmos campos que a Fatia A materializa ao iniciar um processo.

## Estado atual (reuso)

- Tabelas já existem (migration 0079): `legalizacao_template(id, tipo, slug unique, nome, descricao, ativo, criado_em)` e `legalizacao_template_etapa(id, template_id, ordem, titulo, descricao, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente)`.
- **RLS já restringe escrita a `admin`** (policies `leg_tpl_wr`/`leg_tpetapa_wr`); leitura para admin/contador/assistente. **Sem migration nova.**
- Enums `legalizacao_tipo` e `legalizacao_orgao` e os rótulos em `src/lib/legalizacao/tipos.ts` (`LEGALIZACAO_TIPOS`, `LEGALIZACAO_ORGAOS`).
- Padrão de editor CRUD: espelha o "Template de onboarding" (Configurações), com reordenação ↑↓.

## Escopo (sem migration)

### Ações — `src/app/(app)/configuracoes/legalizacao/actions.ts` (todas admin-only)
- `listarModelos(): Promise<ModeloView[]>` — templates com contagem de etapas.
- `obterModelo(id): Promise<ModeloDetalhe | null>` — metadados + etapas ordenadas.
- `criarModelo({ tipo, nome, descricao }): Promise<{ id?; erro? }>` — gera `slug` único a partir do nome; `ativo=true`.
- `salvarModelo(id, { nome, descricao, tipo, ativo }): Promise<{ ok?; erro? }>`.
- `excluirModelo(id): Promise<{ ok?; erro? }>` — cascade apaga as etapas (não afeta processos já criados, que são cópias).
- `salvarEtapa(input): Promise<{ ok?; erro? }>` — upsert de `legalizacao_template_etapa` (título, descrição, órgão, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente, ordem). Nova etapa entra no fim (maior ordem + 1).
- `excluirEtapa(id): Promise<{ ok?; erro? }>`.
- `reordenarEtapa(id, direcao: "cima"|"baixo"): Promise<{ ok?; erro? }>` — troca `ordem` com a vizinha.

Gate em todas: `perfil.papel === "admin"` (a RLS reforça).

### Telas
- **`/configuracoes/legalizacao`** (admin): lista de modelos (nome, tipo, nº de etapas, ativo) + botão "Novo modelo". Cada modelo linka para o editor.
- **`/configuracoes/legalizacao/[id]`**: 
  - bloco de metadados (nome, descrição, `<select>` tipo com `LEGALIZACAO_TIPOS`, toggle ativo) → `salvarModelo`; botão excluir modelo (confirmação).
  - lista de **etapas** em ordem, cada uma editável inline (título, descrição, `<select>` órgão, prazo_dias, `<select>` responsável por papel, checkboxes anexo obrigatório / avisar cliente) com **↑ ↓** (reordenar) e **remover**; botão "+ etapa".
- **Link no hub** `Configurações` (`page.tsx` → ITENS): `{ href: "/configuracoes/legalizacao", label: "Modelos de legalização", desc: "Processos societários e de legalização (etapas por órgão)." }`.

### Componentes
- `src/app/(app)/configuracoes/legalizacao/page.tsx` (server, lista) + `ModelosLista` (client, criar).
- `src/app/(app)/configuracoes/legalizacao/[id]/page.tsx` (server) + `EditorModelo.tsx` (client: metadados + etapas + reorder).

## Testes
- **Unit** (`legalizacao-modelo.test.ts`): helper `slugModelo(nome, existentes)` — kebab-case, remove acentos, resolve colisão com sufixo. (Função pura em `src/lib/legalizacao/modelo.ts`.)
- **RLS** (`rls.test.sql`): já coberto na Fatia A que **só admin escreve** template/etapa; adicionar assert curto de que **contador não** cria template (barrado) — se ainda não houver.
- Suíte completa verde antes de cada commit.

## Fora de escopo
- Versionamento de modelos / histórico de edições.
- Duplicar modelo (clone) — pode vir depois.
- Condicionais por perfil/flags nas etapas (o onboarding tem; a legalização mantém etapas fixas por modelo).

## Segurança
- Escrita **admin-only** na RLS (não só na action).
- Excluir modelo **não** afeta processos em andamento (as etapas de instância são cópias, tabela separada).
