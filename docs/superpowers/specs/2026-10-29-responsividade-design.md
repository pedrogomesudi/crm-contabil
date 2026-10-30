# Responsividade do SALDO — Design

**Data:** 2026-10-29
**Status:** Aprovado (design) — pendente escrita do plano

## Objetivo

Tornar o sistema utilizável em qualquer dispositivo, em dois níveis distintos:

1. **Nada quebrado, em todas as 99 telas.** Nenhuma tela estoura a largura nem espreme conteúdo
   a ponto de impedir a leitura.
2. **Confortável no celular, nos fluxos que alguém de fato abre fora da mesa:** Clientes (lista e
   ficha), Contas a receber e inadimplência, Atendimento (WhatsApp), Tarefas/Obrigações/Vencimentos.

Telas de trabalho pesado (grade de orçamento, conciliação bancária) ficam utilizáveis para
**consulta**, não para operação. Essa distinção é deliberada: redesenhá-las para celular seria
trabalho de semanas em telas que ninguém opera no celular.

## Diagnóstico: a fundação existe, a adoção parou pela metade

O levantamento desmentiu a premissa de que "o sistema não é responsivo". O estado real:

| Camada | Situação |
|---|---|
| Esqueleto (`(app)/layout.tsx` + `Sidebar`) | **Pronto.** Gaveta abaixo de `md`, barra lateral fixa acima |
| `PageHeader` | **Pronto.** `flex-col sm:flex-row`, ações com `flex-wrap` |
| `Container` | **Pronto.** Usa `max-width`, não largura fixa |
| `FormGrid` | **Pronto** (`grid-cols-1 md:grid-cols-12`) — **mas só 3 arquivos o adotaram** |
| Tabelas | **51 de 62** já rolam na horizontal; **11 não** |
| Grades `grid-cols-N` | **20 ocorrências sem breakpoint** |

O comentário do próprio `FormGrid` registra que ele nasceu para resolver este problema — *"os 40
`grid-cols-2` do sistema não tinham breakpoint e espremiam a tela do celular"*. A migração começou
e não terminou. Portanto o trabalho é **concluir uma adoção**, não construir fundação.

## Breakpoint único: 768px (`md`)

Mesmo ponto de virada que a `Sidebar` já usa. Um só limiar no sistema inteiro, fácil de lembrar e
de testar. Tablet deitado (1024px) continua vendo tabela; tablet em pé e celular veem cartões.

Decisão deliberada contra "depende da tabela": limiar por tela é inconsistência que ninguém mantém.

## Parte 1 — Varredura (todas as telas)

### 1.1 Tabelas sem rolagem horizontal (11)

Recebem o mesmo wrapper que as outras 51 já têm.

```
app/(app)/clientes/page.tsx
app/(app)/comercial/propostas/[id]/documento/DocumentoProposta.tsx
app/(app)/financeiro/regua-cobranca/Regua.tsx
app/(app)/usuarios/page.tsx
app/docs/page.tsx
components/documentos/DocumentosTabela.tsx
components/documentos/TabelaResultadosBusca.tsx
components/documentos/TabelaRetencao.tsx
components/financeiro/CadastroCrud.tsx
components/financeiro/DashboardFinanceiro.tsx
components/financeiro/GruposCobranca.tsx
```

### 1.2 Grades sem breakpoint (20)

Duas naturezas, dois tratamentos:

- **Formulário** → migra para o `FormGrid` existente, com `span` por natureza do dado.
- **Grade de layout** (calendário, métricas, painéis) → ganha prefixo `sm:`/`md:`, empilhando em
  uma coluna no celular.

Ocorrências em: `MetricasFunil`, `Calculadora`, `PainelRiscosView`, `FormConstituicao`,
`Calendario` (2), `EditorTarefa`, `EditorModelo`, `Formularios` (NFS-e), `FormMarca`,
`FormCliente`, `EmitenteConfig`, `FormDadosPagamento`, `FormProcuracao`, `EmitirNfseCliente`,
`ContratosSection`, `ContasPagar` (2).

> `components/ui/FormGrid.tsx` aparece na busca mas **não** é defeito: é a definição do primitivo,
> que já traz `grid-cols-1` antes do `md:grid-cols-12`.

## Parte 2 — Tabela que vira cartões

### Abordagem escolhida

Das três avaliadas:

- **A — só rolagem horizontal:** barato, mas no celular a pessoa rola de lado para ler uma linha.
  Serve para consultar, é ruim para trabalhar. Não entrega o nível 2 do objetivo.
- **B — tabela vira cartões por CSS (escolhida):** mantém o `<table>` existente; abaixo de `md` o
  cabeçalho some e cada linha vira um cartão, com o rótulo da coluna ao lado do valor. O CSS é
  escrito **uma vez** e vale para qualquer tabela que receba a classe.
- **C — componente novo que recebe colunas como dados:** mais elegante, e o projeto já tem esse
  formato no `RelatorioExportavel` — uma declaração só poderia alimentar a tabela **e** o arquivo
  exportado. Mas é reescrever 62 telas. Fica registrada como evolução natural, se o pareamento
  tabela↔exportação justificar.

A **B** foi escolhida porque o custo por tabela é marcar as células com seu rótulo — trabalho
mecânico, sem reescrever JSX nem lógica — e porque permite entregar em fatias.

### Mecânica

Uma classe aplicada à `<table>` e um atributo por célula:

```html
<table class="tabela-cartao">
  <td data-rotulo="Cliente">…</td>
```

Abaixo de 768px: `thead` oculto, cada `tr` vira cartão com borda, cada `td` vira linha
rótulo/valor usando `content: attr(data-rotulo)`. Acima: tabela normal, nada muda.

**Risco conhecido do Tailwind 4:** o scanner estático só reconhece strings literais completas.
O CSS do cartão fica numa folha própria (não em classes utilitárias interpoladas), pelo mesmo
motivo já documentado no `FormGrid` — classe montada por interpolação passa nos testes e **não é
gerada no build**, quebrando em produção, em silêncio.

### Ordem de aplicação

Os quatro fluxos marcados, nesta ordem (do mais consultado ao menos):

1. Clientes — lista e ficha
2. Contas a receber e inadimplência
3. Atendimento (WhatsApp)
4. Tarefas, Obrigações e Vencimentos

As demais telas ficam com rolagem (sem quebrar). Receber os rótulos depois é tarefa por tela, não
projeto novo.

## Verificação

**O que os testes alcançam:** render tests garantem que a classe e os `data-rotulo` estão no HTML,
e que nenhuma tabela ficou sem wrapper de rolagem. Isso prova **marcação**, não aparência.

**O que não alcançam:** se ficou bom de ler num celular. Tentou-se auditar no navegador em 390px e
não foi possível neste ambiente — o `resize_window` encolhe a janela externa mas a viewport segue
em 1710px, e a alternativa por iframe é barrada pelo próprio sistema (`frame-ancestors 'none'` e
`X-Frame-Options: DENY` no `next.config.ts`, proteção correta contra clickjacking que não se
contorna para fins de teste).

**Portanto a verificação visual é do usuário, no aparelho dele** — que é o teste real de qualquer
forma. A entrega é feita **em fatias**, uma frente por vez, para a conferência acontecer durante e
não só no fim.

## Fora de escopo

- Redesenhar telas de operação pesada para uso em celular (orçamento, conciliação).
- Migrar as 51 tabelas restantes para cartões — ficam com rolagem; são tarefa posterior, por tela.
- A abordagem C (colunas como dados) e o pareamento tabela↔exportação.
- Aplicativo nativo ou PWA instalável.
