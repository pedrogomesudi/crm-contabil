# V5-A — NFS-e avulsa (serviço extra) — design

> **Status:** design aprovado para implementação · **Data:** 2026-07-02 · **Extensão da** V5-A (NFS-e dos honorários)

## 1. Contexto e objetivo

Hoje a emissão pela ficha usa sempre o **honorário** como valor e **bloqueia** uma segunda nota no
mesmo cliente+competência (a trava anti-duplicidade criada para o lote). Quando o escritório presta
um **serviço extra** no mês, precisa emitir **mais uma nota** para o mesmo cliente na mesma
competência — com **valor e descrição próprios**, emitida **individualmente pela ficha** (não pelo
lote). Esta etapa habilita isso sem quebrar a emissão em lote da nota recorrente.

## 2. Decisões do brainstorming

- **Valor/descrição na ficha:** valor **pré-preenchido com o honorário, editável**; **descrição**
  opcional (default "Honorarios").
- **Distinção explícita:** um checkbox **"nota avulsa (serviço extra)"** na ficha. Marcado = avulsa
  (extra); desmarcado = a recorrente do mês.
- **Anti-duplicidade:** vale **apenas para a recorrente**; a avulsa é sempre permitida.
- **Lote:** inalterado no comportamento desejado — emite só recorrentes e passa a olhar só
  recorrentes ao marcar "já emitida" (uma avulsa não faz o lote pular a recorrente do cliente).

## 3. Modelo de dados

- Migration nova (`0022_nfse_avulsa.sql`, idempotente): `alter table nfse add column if not exists
  avulsa boolean not null default false;`
- **Recorrente** = `avulsa = false` (a nota do honorário; o lote emite estas). **Avulsa** =
  `avulsa = true` (serviço extra).

## 4. Motor de emissão

`emitirNfseCliente(clienteId, competencia, opcoes?)` passa a aceitar
`opcoes?: { valor?: number; descricao?: string; avulsa?: boolean }`:

- **valor** = `opcoes.valor ?? honorário`. Exige `valor > 0`.
- **descricao** = `opcoes.descricao ?? config.descricaoServico` (default "Honorarios") — vira o
  `xDescServ` da DPS.
- **avulsa** = `opcoes.avulsa ?? false` — gravado em `nfse.avulsa`.
- **Anti-duplicidade:** só quando `avulsa = false` — bloqueia se já existe `nfse` **autorizada com
  `avulsa = false`** na mesma competência+ambiente. Para `avulsa = true`, sem checagem.
- **Honorário:** deixa de ser obrigatório quando há `valor` informado (permite avulsa a cliente sem
  honorário); a recorrente sem valor informado continua exigindo honorário > 0.
- **O lote** chama `emitirNfseCliente(clienteId, competencia)` **sem opções** → recorrente, valor =
  honorário, descrição padrão.

## 5. UI (ficha do cliente)

O botão **"Emitir NFS-e"** (componente `EmitirNfse`) passa a ter:

- **Valor** — input numérico pré-preenchido com o honorário, editável.
- **Descrição do serviço** — input opcional (placeholder "Honorarios").
- **☐ Nota avulsa (serviço extra)** — checkbox.
- **Competência** — como hoje.

A action da ficha (`emitirNfse`, baseada em `FormData`) lê valor/descrição/avulsa e chama
`emitirNfseCliente` com as opções. A lista **"Notas fiscais"** exibe as avulsas junto das recorrentes
(um rótulo "avulsa" as distingue).

## 6. Lote (ajuste mínimo)

- `listarElegiveisLote`: a marcação **já_emitida** passa a considerar apenas `nfse` autorizada com
  `avulsa = false`. Assim um cliente com apenas uma avulsa no mês continua **apto** para a recorrente.
- O lote continua emitindo recorrentes (sem opções) — nada muda no fluxo da tela.

## 7. Erros e casos de borda

- **Valor ≤ 0 / inválido:** bloqueia com aviso.
- **Recorrente já existe** (avulsa=false) e tenta emitir outra recorrente: bloqueia (trava mantida).
- **Avulsa:** sempre permitida, mesmo com recorrente já emitida.
- **Cliente sem honorário** emitindo avulsa com valor informado: emite normal.
- **Homologação × produção:** inalterado (herda `nfse_config.ambiente`).

## 8. Testes

- **`emitirNfseCliente` (comportamento):** recorrente respeita a trava; avulsa sempre passa; valor e
  descrição informados são usados. (Verificado no fluxo + typecheck; caminhos críticos por E2E.)
- **`listarElegiveisLote`:** cliente com só uma avulsa continua `apta`; com recorrente vira
  `ja_emitida`.
- **RLS:** inalterada (mesma policy de `nfse`); assert atual continua válido.
- **E2E (homologação/produção):** emitir a recorrente; tentar 2ª recorrente (bloqueia); emitir uma
  **avulsa** com valor/descrição próprios (autoriza); conferir que o lote ainda lista o cliente como
  apto se só houver avulsa.

## 9. Fora do escopo

- Múltiplos **itens de serviço** numa mesma nota (a nota continua de um serviço só).
- Emissão de avulsa **em lote** (avulsa é sempre individual, pela ficha).
