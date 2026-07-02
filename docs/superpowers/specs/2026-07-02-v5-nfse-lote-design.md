# V5-A fase 2 — Emissão de NFS-e em lote (mensal) — design

> **Status:** design aprovado para implementação · **Data:** 2026-07-02 · **Extensão da** V5-A (NFS-e dos honorários do escritório)

## 1. Contexto e objetivo

A V5-A emite a NFS-e dos honorários **por cliente, sob demanda**. Como os honorários são recorrentes,
o escritório quer **emitir todas de uma vez** por competência (mês). Esta etapa adiciona a **emissão
em lote**, reusando integralmente o motor de emissão já validado em produção.

## 2. Decisões do brainstorming

- **Universo:** todos os clientes **ativos com honorário mensal** definido (o honorário mensal já é o
  "contrato recorrente"; não há flag separada). Hoje são ~69 de 116 ativos.
- **Seleção:** todos **pré-marcados**, com **desmarcar pontual** antes de confirmar.
- **Execução (abordagem A):** o **navegador orquestra** — emite **uma nota por vez** (cada uma é um
  request curto), com **progresso ao vivo**. Sem risco de timeout, resiliente a falha isolada, reusa
  a emissão por cliente. (Rejeitadas B "tudo num request" e C "job em background".)
- **Relatório final:** um **CSV** consolidado (o que saiu, o que não saiu e por quê).

## 3. Arquitetura

Sem tabelas novas — cada nota do lote é um registro normal em `nfse` (agrupado por competência). O
"lote" é apenas um laço orquestrado no navegador.

- **`emitirNfseCliente(clienteId, competencia): Promise<ResultadoCliente>`** — server action enxuta
  (sem `FormData`) extraída da emissão atual: monta DPS → assina → envia → grava, e devolve
  `{ status: "autorizada" | "rejeitada" | "erro" | "pulada"; chave?: string; numero?: string;
  motivo?: string }`. A emissão da ficha (V5) passa a **delegar** para ela (mesma lógica).
- **`listarElegiveisLote(competencia): Promise<ClienteLote[]>`** — server action que lista os
  clientes ativos com honorário (via RLS — contador vê só os seus; admin/financeiro veem todos) e
  marca cada um: `apta` · `ja_emitida` (há `nfse` autorizada nessa competência+ambiente) ·
  `sem_documento` (sem CNPJ/CPF). Retorna `{ clienteId, razaoSocial, documento, honorario, temEndereco,
  situacao }`.
- **Tela `/nfse/lote`** (client component com estado): competência → preview (checkboxes) → execução
  ao vivo → resumo + download do CSV.
- **`src/lib/nfse/relatorioLote.ts`** — `montarCsv(linhas: LinhaRelatorio[]): string` (puro,
  testável): gera o CSV a partir dos resultados acumulados.

## 4. Fluxo

1. **Competência:** input de mês (vira `YYYY-MM-01`).
2. **Preview:** `listarElegiveisLote` popula uma tabela com checkbox por cliente:
   - `apta` → **pré-marcada**.
   - `ja_emitida` → desmarcada e **travada** (não reemite).
   - `sem_documento` → desmarcada e **travada** (não dá para emitir).
   - `temEndereco = false` → marcável, mas com **aviso** (pode rejeitar por falta de `end`).
   - Exibe **total selecionado** (nº de notas + soma dos honorários) e **aviso do ambiente**
     (homologação = sem validade jurídica).
3. **Confirmar e emitir:** o navegador percorre os selecionados **um a um**, chamando
   `emitirNfseCliente`; atualiza o **progresso ao vivo** (`23/69 · 21 ✓ · 2 ✗`) e a linha do cliente
   (`emitindo…` → `autorizada ✓` / `rejeitada ✗ (motivo)` / `erro`). Botão **Parar** interrompe após
   a nota corrente (as já emitidas permanecem).
4. **Resumo + relatório:** contadores finais e botão **Baixar relatório (CSV)** com todas as linhas
   (inclusive puladas), com o motivo das que não saíram.

## 5. Relatório CSV

Uma linha por cliente processado. Colunas: `Cliente`, `CNPJ/CPF`, `Competência`, `Valor`,
`Resultado` (Autorizada · Rejeitada · Erro · Pulada — já emitida · Pulada — sem CNPJ), `Número`,
`Chave de acesso`, `Motivo`. Montado no cliente a partir dos resultados acumulados (sai na hora, sem
processamento extra). Escape de CSV (aspas/quebras) tratado em `montarCsv`.

## 6. Permissões

- Tela e actions gated por **`podeVerHonorario`** (admin/financeiro/contador-dono). A **RLS** de
  `clientes`/`clientes_financeiro`/`nfse` já limita o universo por papel — um contador só enxerga e
  emite para os clientes dele; admin/financeiro para todos.

## 7. Erros e casos de borda

- **Sem CNPJ/CPF:** não emite (marcado, travado).
- **Já emitida na competência+ambiente:** pulada (não reemite) — idempotência ao rodar de novo.
- **Sem endereço:** emite, mas pode ser rejeitada pela Sefin — aparece no resumo/relatório com o
  motivo.
- **Rejeição fiscal / erro de rede num cliente:** registra o motivo, **segue** para o próximo (não
  derruba o lote). Rodar de novo pula as autorizadas e retenta as que faltaram.
- **Parar no meio:** interrompe após a nota corrente; nada é desfeito.
- **Homologação × produção:** herda `nfse_config.ambiente`; aviso visível; o selo de ambiente (v5.1.1)
  distingue as notas.

## 8. Testes

- **`listarElegiveisLote` (unit, supabase mockado):** filtra ativos com honorário; marca
  `ja_emitida`/`sem_documento` corretamente.
- **`emitirNfseCliente` (unit, dependências mockadas):** retorna `ResultadoCliente` estruturado nos
  caminhos autorizada/rejeitada/erro; a action da ficha continua funcionando ao delegar.
- **`montarCsv` (unit):** cabeçalho + linhas + escape de vírgula/aspas/quebra de linha.
- **E2E (homologação):** lote pequeno (2-3 clientes), conferir progresso, pulo de já-emitida e o CSV.

## 9. Fora do escopo (consciente)

- **Baixar todos os DANFSe num .zip** (por ora, o download é por nota, via v5.1.0).
- **Agendamento automático mensal** (o disparo continua manual).
- **Tabela/entidade "lote"** — não é necessária; o agrupamento é por competência.
