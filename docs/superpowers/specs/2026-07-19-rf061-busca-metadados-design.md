# RF-061 (busca por metadados) — Design

**O que é:** uma página central de **busca de documentos** para a equipe — achar qualquer documento por
**nome + tipo + departamento + competência + cliente**, de qualquer lugar, com a RLS limitando aos clientes
visíveis. É a primeira camada do RF-061; a **busca no conteúdo (full-text/OCR)** fica para uma fatia separada
(RF-061b). Aproveita o catálogo e os eixos entregues no RF-060. **Uma fatia; sem migration.**

## O estado de hoje (medido)

- Documentos só aparecem **por cliente** (`DocumentosSection`/`DocumentosTabela` na ficha) — **não há** uma
  visão central nem busca de documentos. A rota `src/app/(app)/documentos/` tem só `actions.ts`/`estados.ts`
  (sem `page.tsx`).
- Já há taxonomia (RF-060): `documentos.tipo_id/departamento/competencia` + catálogo `tipo_documento`; e
  versionamento (RF-060 B): `documentos.substitui_id` com `agruparVersoes` (`src/lib/documentos/versoes.ts`).
- Padrão de busca por nome: `.ilike("nome", "%termo%")` + `escapeLike` (`src/lib/clientes/busca.ts`), usado em
  `clientes/responsaveis` (busca por `searchParams`, server component).
- Download: `gerarLinkDownload(documentoId)` (URL assinada). Rótulos: `competenciaRotulo` (RF-060),
  `rotuloDepartamento` (`@/lib/clientes/departamentos`). Menu: `src/lib/ui/navegacao.ts` (`menuDoPapel`);
  guard `rotas-alcancaveis` exige a rota nova registrada.
- **Não há** `tsvector`/full-text nem OCR; extensões `pg_trgm`/`unaccent` não instaladas (`pg_cron` sim).

## Escopo (decidido no brainstorm)

- **Busca por metadados** (nome + tipo + departamento + competência + cliente), central, RLS-escopada.
- **Sem** busca no conteúdo (full-text/OCR) — RF-061b, fatia à parte.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde | nova rota `/documentos` (menu da equipe) | Não existe visão central; é o lugar natural. |
| Busca de nome | `.ilike` + `escapeLike` | Padrão do projeto; acento-sensível, aceitável no MVP. |
| Competência | filtro por **mês** (intervalo `[1º dia, 1º do mês seguinte)`) | Reusa `competenciaParaData`; casa com a coluna `date`. |
| Versões | mostra só as **atuais** (`agruparVersoes`) | Não repetir versões substituídas nos resultados. |
| Permissão | quem gerencia documentos (admin/assistente/contador); financeiro lê | Espelha a visibilidade do GED. |
| RLS | consulta sob a sessão do usuário | Já limita aos clientes visíveis; sem lógica extra. |

## Arquitetura

### Lógica pura (`src/lib/documentos/busca.ts`)

```ts
export type FiltroBusca = {
  nome?: string;
  tipoId?: string;
  departamento?: string;
  clienteId?: string;
  competencia?: string;   // "AAAA-MM"
};
export type FiltroResolvido = FiltroBusca & { compInicio?: string; compFim?: string };

// Lê os searchParams crus e devolve o filtro limpo: vazios omitidos; competência "AAAA-MM"
// vira o intervalo do mês (compInicio = 1º dia; compFim = 1º dia do mês seguinte).
export function lerFiltroBusca(sp: Record<string, string | undefined>): FiltroResolvido;
```

Reusa `competenciaParaData` (RF-060) para o `compInicio`; o `compFim` é o 1º dia do mês seguinte (cálculo puro
sobre "AAAA-MM"). Testável sem banco.

### Action (`src/app/(app)/documentos/actions.ts`)

`buscarDocumentos(filtro: FiltroResolvido)` — query em `documentos` sob a sessão do usuário (RLS):
- join `clientes(razao_social)` e `tipo_documento(nome)`;
- `nome` → `.ilike("nome", "%" + escapeLike(nome) + "%")`;
- `tipoId`/`departamento`/`clienteId` → `.eq`;
- `compInicio`/`compFim` → `.gte("competencia", compInicio).lt("competencia", compFim)`;
- `.order("enviado_em", { ascending: false }).limit(100)`.

Devolve a lista já achatada para a tabela, **filtrando às versões atuais** com `agruparVersoes` (por `id`/
`substitui_id`): `{ id, nome, clienteId, clienteNome, tipo, departamento, competencia, enviado_em }`.

### Telas

- **`/documentos/page.tsx`** (server component; gate por papel): lê os `searchParams`, monta o `FiltroResolvido`
  com `lerFiltroBusca`, chama `buscarDocumentos`, carrega os tipos ativos (`carregarTiposAtivos`) e a lista de
  clientes (para o select), e renderiza a barra de filtros + a tabela de resultados.
- **`BuscaDocumentos.tsx`** (client): a barra de filtros — input de nome, selects de tipo/departamento/
  competência (mês) e cliente — que navega atualizando os `searchParams` (molde de `clientes/responsaveis`).
  Controles via `controleCls`.
- **Tabela de resultados**: colunas **Nome · Cliente (link para a ficha) · Tipo · Departamento · Competência ·
  Enviado em · Baixar** (`BotaoBaixar` + `competenciaRotulo`/`rotuloDepartamento`). Estado vazio claro.
- **Menu**: item "Documentos" em `navegacao.ts` para os papéis certos; registrar `/documentos` no guard
  `rotas-alcancaveis` (SubNav/menu conforme o padrão vigente).

## Fatia de implementação

Uma fatia: `lerFiltroBusca` (com testes) + `buscarDocumentos` + a página `/documentos` e a `BuscaDocumentos` +
o item de menu/registro no guard + release. **Sem migration.**

## Verificação

- **Lógica testável:** `lerFiltroBusca` — competência "AAAA-MM" → `compInicio`/`compFim` corretos (incl. virada
  de ano em dezembro), vazios omitidos, nome preservado, tipo/departamento/cliente repassados.
- **Busca:** os filtros combinam com E; a RLS impede ver documento de cliente não-visível (o teste de RLS ou a
  própria política cobre); só versões atuais aparecem; `limit(100)`.
- **Telas:** render da tabela (colunas + estado vazio) sem `border` à mão (guard `divida-ui`); a barra de
  filtros preserva os valores dos `searchParams`.
- **Não-regressão:** `rotas-alcancaveis` (rota `/documentos` registrada); `lint`/`typecheck`/`test`/
  `format:check`/`build`; **sem migration**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Busca no **conteúdo** do documento (full-text) | RF-061b; exige extrair texto e indexar. |
| **OCR** de digitalizações | RF-061b; decisão de infra (biblioteca vs API + custo/segredo). |
| Busca fonética/aproximada (trigram) | Exige `pg_trgm`; além do MVP de metadados. |
| Busca acento-insensível | O `ilike` é acento-sensível — mesma limitação das buscas atuais; `unaccent` fica para depois. |
| Busca a partir do portal (cliente) | O portal já lista os próprios documentos; a busca central é da equipe. |

## Riscos

| Risco | Mitigação |
|---|---|
| Base grande sem índice de texto | `limit(100)` + filtros estruturados (tipo/departamento/competência) reduzem o conjunto; `ilike` sobre `nome` é aceitável no volume atual. |
| Ver documento de cliente alheio | A consulta roda sob a RLS de `documentos` (visibilidade do cliente); sem service_role. |
| Versões antigas poluírem os resultados | `agruparVersoes` mostra só as atuais. |
| Termo de busca com `%`/`_` | `escapeLike` neutraliza os curingas. |
