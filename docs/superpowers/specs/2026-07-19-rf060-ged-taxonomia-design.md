# RF-060 — GED: taxonomia + versionamento — Design

**O que é:** dar ao acervo de documentos do cliente uma **taxonomia** (departamento + tipo + competência) e
**versionamento** (histórico quando um documento substitui outro). Hoje o GED só tem `nome` + `tipo` texto
livre — não dá para filtrar por departamento nem por competência, nem guardar versões. **Duas fatias**; cada
uma tem migration.

## O estado de hoje (medido)

- `documentos` (`0005` + `0086`): `id, cliente_id (NOT NULL), nome, tipo (text livre), caminho_storage (unique,
  prefixo cliente_id — `chk_caminho_prefixo` da `0011`), origem ('escritorio'|'cliente'), enviado_por,
  enviado_em`. RLS: leitura para quem vê o cliente; escrita admin/contador/assistente; delete admin.
- Upload: `anexarDocumento` (`src/app/(app)/documentos/actions.ts`) grava `nome` + `tipo` (texto livre) no
  bucket "documentos"; `UploadDocumento.tsx` tem um input `tipo` livre. Listagem `DocumentosSection.tsx` mostra
  Nome/Tipo/Enviado/Ações — **sem departamento, competência, versão, filtro ou busca**.
- Há um acoplamento a corrigir com cuidado: `DocumentosSection.tsx` tem um caso especial `d.tipo === "Contrato"`
  (habilita "gerar contrato assinado"). Trocar `tipo` por id quebraria isso — por isso mantemos o `tipo` texto.
- Enum `departamento` já existe: `contabil | fiscal | pessoal | societario`
  (`src/lib/clientes/departamentos.ts`, `DEPARTAMENTOS`, `rotuloDepartamento`).
- Padrão de tela de config reutilizável: `/configuracoes/campos-custom` (RF-027) — CRUD admin com `moverNaOrdem`,
  RLS leitura-equipe/escrita-admin, link no hub `/configuracoes/page.tsx` (coberto por `POR_HUB` no guard
  `rotas-alcancaveis`).

## Escopo (decidido no brainstorm)

- **Tipo = catálogo configurável por escritório** (`tipo_documento`, gerido pelo admin) — não texto livre nem
  enum fixo.
- **Fatia A — taxonomia:** catálogo + eixos departamento/competência + upload classificado + filtros na lista.
- **Fatia B — versionamento:** `substitui_id` (auto-ref); a lista mostra os atuais, "ver versões" abre a cadeia.
- A taxonomia vale dos **novos uploads em diante** — documentos antigos ficam com os campos nulos (não retroage).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Tipo | catálogo `tipo_documento` (admin) | Flexível, consistente com RF-027; filtro confiável. |
| Compatibilidade do `tipo` texto | **mantém** `documentos.tipo`, denormalizado com o nome do catálogo no upload | Não quebra o caso `d.tipo === "Contrato"`. |
| Departamento | reusa o enum `departamento` | Já existe; sugerido pelo tipo, editável no upload. |
| Competência | `date` no **dia 1 do mês**; nullable | Mensal cobre o grosso (guias, holerites, balancetes); nulo p/ contrato/procuração. |
| Config | `/configuracoes/tipos-documento` (admin) | Molde da `campos-custom`. |
| Versionamento | `substitui_id` auto-ref; lista mostra os atuais | Simples; sem apagar; histórico por cadeia. |

## Arquitetura

### Fatia A — taxonomia

#### Modelo de dados (migration 0111)

```sql
create table if not exists tipo_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  departamento departamento,        -- sugerido; nullable
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table documentos add column if not exists tipo_id uuid references tipo_documento(id);
alter table documentos add column if not exists departamento departamento;
alter table documentos add column if not exists competencia date;   -- dia 1 do mês; nullable

alter table tipo_documento enable row level security;
drop policy if exists tipo_documento_read  on tipo_documento;
drop policy if exists tipo_documento_write on tipo_documento;
create policy tipo_documento_read  on tipo_documento for select using (auth_papel() in ('admin','assistente','contador','financeiro'));
create policy tipo_documento_write on tipo_documento for all
  using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
```

Os campos novos em `documentos` herdam a RLS de `documentos`. `financeiro` lê o catálogo (só VÊ documentos).

#### Lógica pura (`src/lib/documentos/taxonomia.ts`)

Os pontos que valem isolar/testar:
```ts
// "2026-07" -> "2026-07-01" (dia 1); "" -> null; formato inválido -> null.
export function competenciaParaData(aaaaMM: string): string | null;
// "2026-07-01" -> "07/2026"; null -> "—".
export function competenciaRotulo(data: string | null): string;
// Departamento sugerido a partir do tipo escolhido (do catálogo), fallback null.
export function departamentoDoTipo(tipos: { id: string; departamento: string | null }[], tipoId: string): string | null;
```

#### Actions

- **Catálogo** (`src/app/(app)/configuracoes/tipos-documento/actions.ts`, no molde de `campos-custom/actions.ts`):
  `listarTiposDocumento`, `carregarTiposAtivos`, `criarTipo` (nome + departamento sugerido), `moverTipo`,
  `alternarAtivo`, `removerTipo`. Gate admin.
- **Upload** (`anexarDocumento`): passa a ler `tipo_id`, `departamento` e `competencia` do form; valida `tipo_id`
  contra o catálogo ativo; grava `tipo_id`, `departamento`, `competencia` (via `competenciaParaData`) e o `tipo`
  texto = nome do tipo (denormalizado). Sem tipo escolhido, o comportamento atual (tipo livre) segue válido.
- **Listagem** (`listarDocumentos`/`DocumentosSection`): aceita filtros por `departamento`, `tipo_id` e
  `competencia`; devolve os campos novos + o nome do tipo.

#### Telas

- **`/configuracoes/tipos-documento`** (admin): CRUD do catálogo (nome, departamento sugerido, ordem por setas,
  ativar/desativar, remover). Link no hub `/configuracoes/page.tsx`.
- **`UploadDocumento`**: **tipo** (select do catálogo ativo), **departamento** (auto do tipo, editável),
  **competência** (input mês/ano, opcional). Controles via `controleCls` (guard `divida-ui`).
- **`DocumentosSection`**: colunas **Departamento** e **Competência**; barra de **filtros** (departamento, tipo,
  competência). Mantém o caso `d.tipo === "Contrato"` funcionando.

### Fatia B — versionamento

```sql
alter table documentos add column if not exists substitui_id uuid references documentos(id) on delete set null;
```
- "Enviar nova versão" parte de um documento existente: o novo documento herda tipo/departamento/competência e
  grava `substitui_id = <doc antigo>`. A listagem mostra só os **atuais** (nenhum outro documento o referencia
  em `substitui_id`); um "ver versões" abre a cadeia (via `substitui_id`). Nada é apagado.
- Lógica pura: `versaoAtual(docs)` / `cadeiaDeVersoes(docs, id)` para montar a árvore a partir das linhas.

## Fatias de implementação

- **Fatia A — taxonomia:** migration 0111; lógica pura (`competenciaParaData`/`competenciaRotulo`/
  `departamentoDoTipo`) com testes; actions do catálogo; upload classificado; filtros + colunas na listagem;
  config screen; release.
- **Fatia B — versionamento:** migration `substitui_id`; "enviar nova versão"; lista mostra atuais + histórico;
  lógica pura de cadeia; release.

## Verificação

- **Lógica testável:** `competenciaParaData` (mês válido/ inválido/ vazio), `competenciaRotulo`,
  `departamentoDoTipo`; na Fatia B, `versaoAtual`/`cadeiaDeVersoes`.
- **Upload:** grava tipo_id + departamento + competência + tipo denormalizado; sem tipo, mantém o fluxo atual.
- **Listagem:** filtros por departamento/tipo/competência; o caso `d.tipo === "Contrato"` segue.
- **Config:** CRUD admin-gated; reordenar por setas; desativar esconde do upload sem apagar.
- **Não-regressão:** `divida-ui` (controles via `controleCls`); `rotas-alcancaveis` (config coberto pelo hub);
  `lint`/`typecheck`/`test`/`format:check`/`build`; migration idempotente e **aplicada em produção antes do
  deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Busca por metadados / full-text / OCR | É o RF-061. |
| Retenção por tipo e expurgo | É o RF-062. |
| Migrar os `tipo` texto-livre existentes para o catálogo | Fica manual/opcional; não bloqueia. |
| Competência anual/livre | Mensal (dia 1) cobre o grosso; anual usa o mês de referência ou fica nulo. |
| Taxonomia nos documentos enviados pelo cliente (portal) | Foco no upload do escritório; o do cliente pode receber tipo depois. |

## Riscos

| Risco | Mitigação |
|---|---|
| Documentos antigos sem departamento/tipo_id/competência | Campos nullable; a lista mostra "—"; a taxonomia vale dos novos em diante. |
| Quebrar o caso `d.tipo === "Contrato"` | Mantém o `tipo` texto, denormalizado com o nome do tipo no upload. |
| Desativar/remover um tipo em uso | `ativo=false` preferível; `tipo_id` vira referência órfã inofensiva (o `tipo` texto preserva o rótulo). |
| Competência mal digitada | `competenciaParaData` valida o formato e devolve null em vez de gravar lixo. |
