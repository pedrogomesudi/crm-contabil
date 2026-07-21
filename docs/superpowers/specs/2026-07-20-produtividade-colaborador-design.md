# RF-073 — Produtividade por colaborador (design)

## Objetivo

Uma tela que mostra, por pessoa da equipe e num período, quanto ela produziu:
**horas apontadas**, **tarefas concluídas**, **obrigações entregues** e **carteira
atendida** (clientes distintos com hora apontada). Relatório de gestão, admin-only.

## Motivação

As quatro fontes de atribuição já existem e já carimbam colaborador + data —
falta o painel que agrega por pessoa. Hoje só há agregação por cliente
(`relatorioRentabilidade`) e por cliente na conformidade; nenhuma por pessoa.

## Decisões (do brainstorm)

- **Métricas:** as quatro — horas, tarefas concluídas, obrigações entregues, carteira.
- **Permissão:** **somente admin** (`perfil.papel === "admin"`). Diferente da
  rentabilidade (admin+financeiro, que agrega por cliente justamente para não expor
  pessoas), aqui a tela nomeia cada colaborador — é dado de RH/gestão.
- **Localização:** `/financeiro/produtividade`, ao lado da rentabilidade (as duas são
  os relatórios derivados do timesheet e reusam o mesmo `BotaoExportar`). O link no hub
  `/financeiro/cadastros` aparece **só para admin**, porque o hub é visível a financeiro
  e não convém mostrar um item que o barraria.
- **Sem custo salarial por pessoa** (YAGNI + sensível): só contagens e horas.

## Arquitetura

Molde exato da rentabilidade (`src/app/(app)/financeiro/rentabilidade/`): página server
+ action fina + lib pura testável.

### 1. Lib pura — `src/lib/timesheet/produtividade.ts`

Único arquivo com teste unitário. Não importa Supabase nem `server-only` — recebe dados
já puxados e devolve as linhas ordenadas.

```ts
export type LinhaProdutividade = {
  usuarioId: string;
  nome: string;
  minutos: number;    // horas apontadas, em minutos
  tarefas: number;    // tarefas concluídas no período
  obrigacoes: number; // obrigações entregues no período
  carteira: number;   // clientes distintos com hora apontada no período
};

// Entradas cruas que a action puxa do banco.
export type ApontamentoBruto = { usuario_id: string; cliente_id: string | null; minutos: number };

export function agruparProdutividade(args: {
  equipe: { id: string; nome: string }[];         // todos os membros ativos
  apontamentos: ApontamentoBruto[];               // do período
  tarefasPorResponsavel: Record<string, number>;  // responsavel_id -> count
  obrigacoesPorEntregador: Record<string, number>;// entregue_por -> count
}): LinhaProdutividade[];
```

Regras:
- **Universo = `equipe`.** Toda pessoa ativa vira uma linha, mesmo com tudo zero —
  ausência de produção precisa ser visível, não sumir.
- Horas: soma `minutos` dos apontamentos por `usuario_id`.
- Carteira: `Set` de `cliente_id` (ignorando `null`) por `usuario_id` → `.size`.
- Tarefas/obrigações: lookup nos `Record`s (0 quando ausente).
- Ordenação: por `minutos` desc (a métrica-âncora), desempate por `nome` asc.
- `usuario_id`/`responsavel_id`/`entregue_por` que não estejam em `equipe` (ex.: usuário
  inativo que apontou no passado) simplesmente não geram linha — não inventa colaborador.

### 2. Helper de equipe — `src/lib/clientes/colaboradores.ts`

Adicionar `listarEquipe()` ao lado do `listarColaboradores` existente. Diferença: inclui
`financeiro` (que aponta horas e conclui tarefas), usando `PAPEIS_EQUIPE`.

```ts
export async function listarEquipe(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", PAPEIS_EQUIPE)   // admin, contador, assistente, financeiro
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}
```

`listarColaboradores` fica intacto (é usado para "responsável por departamento", que
exclui financeiro de propósito).

### 3. Action — `src/app/(app)/financeiro/produtividade/actions.ts`

`"use server"`. Assinatura: `relatorioProdutividade(de: string, ate: string): Promise<LinhaProdutividade[] | null>`.

- Gate: `const perfil = await getPerfilAtual(); if (!perfil?.ativo || perfil.papel !== "admin") return null;`
- `const admin = createAdminSupabase();`
- Puxa em paralelo:
  - `admin.from("apontamento").select("usuario_id, cliente_id, minutos").gte("data", de).lte("data", ate)`
  - `admin.from("tarefa").select("responsavel_id").eq("status", "concluida").gte("concluida_em", de).lte("concluida_em", `${ate}T23:59:59`)`
  - `admin.from("obrigacao_instancia").select("entregue_por").not("entregue_por", "is", null).gte("entregue_em", de).lte("entregue_em", ate)`
  - `listarEquipe()`
- Reduz tarefas/obrigações a `Record<string, number>` e chama `agruparProdutividade`.

**Detalhe crítico:** `concluida_em` é `timestamptz` (as outras colunas de data são `date`).
O fim do período precisa de `${ate}T23:59:59`, senão tarefas concluídas no próprio dia
`ate` ficam de fora.

### 4. Página — `src/app/(app)/financeiro/produtividade/page.tsx`

Server component, espelha `rentabilidade/page.tsx`:
- Gate no topo: `if (!perfil || perfil.papel !== "admin") redirect("/");`
- Filtro de período por form GET (`de`/`ate`), default = primeiro dia do mês corrente até hoje.
- Chama `relatorioProdutividade(de, ate)`.
- Tabela: Colaborador · Horas (`formatarHoras(minutos)` → "120h30") · Tarefas · Obrigações · Carteira.
- `<BotaoExportar relatorio={relatorio} />` no header.
- Estado vazio quando `linhas` vazio (período sem equipe/atividade).

### 5. Export — `RelatorioExportavel`

Modo simples (dataset pequeno, uma linha por colaborador). Colunas:
- `nome` — `"texto"`, rótulo "Colaborador"
- `horas` — `"texto"` (string "120h30"), rótulo "Horas"
- `tarefas` — `"numero"`, rótulo "Tarefas concluídas"
- `obrigacoes` — `"numero"`, rótulo "Obrigações entregues"
- `carteira` — `"numero"`, rótulo "Carteira"

`totais`: soma de `minutos` (formatado), `tarefas`, `obrigacoes`; `carteira` = `"—"`
(somar clientes por pessoa contaria em duplicidade quem é atendido por dois).
`subtitulo`: `"${de} a ${ate}"`.

### 6. Link no hub — `src/app/(app)/financeiro/cadastros/page.tsx`

Adicionar ao `ITENS`, vizinho de "Rentabilidade por cliente", **condicionado a admin**:
`{ href: "/financeiro/produtividade", label: "Produtividade por colaborador" }`. Como o
`ITENS` é estático, filtrar na renderização por `perfil.papel === "admin"` (a página já
lê o perfil para o gate do hub).

## Testes

Unitários da lib pura (`src/tests/timesheet/produtividade.test.ts`):
1. agrega horas por colaborador (soma minutos).
2. carteira = clientes distintos, ignora `cliente_id` null, não conta duplicado.
3. tarefas/obrigações vêm dos `Record`s; ausente = 0.
4. **membro sem nenhuma atividade aparece com tudo zero** (universo = equipe).
5. ordena por minutos desc, desempate por nome asc.
6. `usuario_id` fora da equipe (inativo que apontou) não vira linha.

## Fora de escopo (YAGNI)

Custo salarial por pessoa; gráficos; drill-down por cliente; agrupamento por
departamento; período comparativo. Contagens e horas por pessoa, só.
