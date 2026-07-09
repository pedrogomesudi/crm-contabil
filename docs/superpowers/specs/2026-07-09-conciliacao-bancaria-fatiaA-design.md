# Conciliação bancária — Fatia A (Importação + movimentações) — Design

**Data:** 2026-07-09
**Marco:** primeira fatia da conciliação bancária do módulo financeiro. Entrega: "subir o extrato do
banco (OFX/CSV) e ver as movimentações por conta, sem duplicar". O **casamento** com títulos/baixas é a
Fatia B.

**Contexto:** financeiro tem `titulo` (RECEBER/PAGAR, status ABERTO/VENCIDO/BAIXADO/...), `baixa`
(titulo_id, data_recebimento, valor_recebido, conta_bancaria_id, forma_pagamento, criado_por — trigger
marca o título BAIXADO), `conta_bancaria` (nome, banco, agência, número, saldo_inicial). Gate
`podeGerenciarFinanceiro` (admin/financeiro). Padrão de import: Domínio (upload → prévia → aplicar).
Helper de CSV existente é só de **saída** (`paraCSV`); a leitura é nova.

**Decisões de brainstorming:**
- **Objetivo do módulo (global):** conciliação faz "os dois" — casar com títulos em aberto (criar baixas)
  E marcar baixas existentes como conciliadas. **Esta fatia (A)** entrega só a importação + persistência
  + visualização; o casamento é a Fatia B.
- **Formatos:** OFX + CSV (com mapeamento de colunas).
- **Persistência:** tabela `movimento_bancario` (dedup, status, histórico).
- **CSV:** uma coluna de valor **com sinal** (negativo/parênteses = débito).

**Escopo (Fatia A):** tabela + parsers OFX/CSV + fluxo de importação com dedup + tela de movimentações.
**Fora (Fatia B):** motor de casamento, criação de baixa a partir do movimento, marcação de conciliado,
saldo extrato × sistema; colunas débito/crédito separadas no CSV.

## 1. Modelo de dados — migration `0064_movimento_bancario.sql` (idempotente)

```sql
create table if not exists movimento_bancario (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references conta_bancaria(id) on delete cascade,
  data date not null,
  valor numeric(15,2) not null,           -- com sinal: + crédito/entrada, − débito/saída
  descricao text,
  fitid text,                              -- id da transação (OFX); null no CSV
  dedup_hash text not null,                -- fitid quando existe; senão hash de data|valor|descricao
  status text not null default 'pendente', -- pendente | conciliada | ignorada (Fatia B)
  baixa_id uuid references baixa(id) on delete set null, -- vínculo (Fatia B)
  importado_em timestamptz not null default now(),
  importado_por uuid references usuarios(id),
  constraint uq_movimento_dedup unique (conta_bancaria_id, dedup_hash),
  constraint chk_movimento_status check (status in ('pendente','conciliada','ignorada'))
);
create index if not exists idx_movimento_conta_data on movimento_bancario (conta_bancaria_id, data);

alter table movimento_bancario enable row level security;
drop policy if exists movimento_sel on movimento_bancario;
create policy movimento_sel on movimento_bancario for select using (auth_papel() in ('admin','financeiro'));
drop policy if exists movimento_ins on movimento_bancario;
create policy movimento_ins on movimento_bancario for insert with check (auth_papel() in ('admin','financeiro'));
drop policy if exists movimento_upd on movimento_bancario;
create policy movimento_upd on movimento_bancario for update using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
```


## 2. Parsers — helpers puros (TDD), em `src/lib/conciliacao/`

```ts
export type MovimentoBruto = { data: string; valor: number; descricao: string; fitid: string | null };
// parse.ts
export function parsearOFX(texto: string): MovimentoBruto[];
export function cabecalhosCSV(texto: string): string[];
export type MapaCSV = { data: string; valor: string; descricao: string };
export function parsearCSV(texto: string, mapa: MapaCSV): MovimentoBruto[];
export function dedupHash(m: MovimentoBruto, contaId: string): string;
```

- **`parsearOFX`** — extrai cada bloco `<STMTTRN>...</STMTTRN>`; de cada um: `DTPOSTED` (aceita
  `YYYYMMDD` e `YYYYMMDDHHMMSS[.xxx][tz]` → ISO `YYYY-MM-DD`), `TRNAMT` (número com sinal e ponto
  decimal), `FITID` (id), descrição = `MEMO` senão `NAME`. Tolerante ao OFX **SGML v1** (tags sem
  fechamento) e **XML v2** (com fechamento) — regex por tag pega os dois. Ignora blocos sem data/valor.
- **`cabecalhosCSV`** — detecta o delimitador (`;` se aparecer mais que `,` na 1ª linha; senão `,`) e
  devolve os nomes de coluna da 1ª linha (trim, sem aspas).
- **`parsearCSV(texto, mapa)`** — usa o mesmo delimitador; para cada linha de dados, lê as colunas
  indicadas por `mapa`; **data** `dd/mm/aaaa` (ou `dd-mm-aaaa`) → ISO; **valor** BR: remove milhar `.`,
  vírgula → ponto, `(x)` ou prefixo `-` → negativo; **descricao** = coluna mapeada. Ignora linhas sem
  data ou valor inválido.
- **`dedupHash`** — se `m.fitid`, retorna `fitid`; senão `sha (curto) / string estável` de
  `${contaId}|${m.data}|${m.valor.toFixed(2)}|${m.descricao.trim().toLowerCase()}`. (Implementação:
  função pura determinística; pode usar `node:crypto` `createHash('sha256')` fatiado, ou uma concatenação
  — desde que estável.)

## 3. Fluxo de importação — actions + UI

**Actions** `src/app/(app)/financeiro/conciliacao/actions.ts` (gate `podeGerenciarFinanceiro`):
```ts
export async function importarMovimentos(contaId: string, movimentos: MovimentoBruto[]): Promise<{ inseridos: number; ignorados: number } | { erro: string }>;
export async function listarMovimentos(contaId: string, inicio: string, fim: string, status: string): Promise<MovimentoView[]>;
export async function jaImportados(contaId: string, hashes: string[]): Promise<string[]>; // dedup na prévia
export async function listarContas(): Promise<{ id: string; nome: string }[]>;
```
- **`importarMovimentos`** — para cada movimento calcula `dedup_hash`, monta a linha (`valor`, `data`,
  `descricao`, `fitid`, `importado_por = perfil.id`) e faz `upsert(..., { onConflict:
  "conta_bancaria_id,dedup_hash", ignoreDuplicates: true })`. Retorna `inseridos` (linhas novas) e
  `ignorados` (total − inseridos).
- **`jaImportados(contaId, hashes)`** — devolve os `dedup_hash` já existentes, para a prévia marcar
  "novo × já importado" sem gravar.

**UI** `conciliacao/page.tsx` (server, gate) + `Conciliacao.tsx` (client):
- Seletor de **conta bancária** + `<input type="file" accept=".ofx,.csv,text/*">`.
- Ao escolher o arquivo, o cliente lê o texto (`file.text()`) e detecta o tipo (extensão/ conteúdo):
  - **OFX:** `parsearOFX` → movimentos.
  - **CSV:** `cabecalhosCSV` → mostra 3 `<select>` (data / valor / descrição, default por heurística de
    nome) → ao mapear, `parsearCSV(texto, mapa)` → movimentos.
- **Prévia:** tabela dos movimentos (data, descrição, valor com cor) + selo **"novo"/"já importado"**
  (via `jaImportados` sobre os `dedupHash`). Botão **"Importar N novos"** → `importarMovimentos` →
  recarrega a lista + mostra `{inseridos, ignorados}`.

## 4. Tela de movimentações

Na mesma página, abaixo: **lista das movimentações** da conta selecionada.
- Filtros: **período** (data inicial/final, default mês atual) e **status** (todos/pendente/conciliada/
  ignorada).
- Colunas: data, descrição, **valor** (crédito em `text-verde`, débito em `text-negativo`), status.
- Rodapé: **total de créditos** e **total de débitos** do período (soma dos positivos / negativos).
- `MovimentoView = { id: string; data: string; descricao: string; valor: number; status: string }`.

## 5. Erros / bordas
- Arquivo sem movimentos válidos → aviso "Nenhuma movimentação reconhecida" (verificar formato).
- CSV sem mapear as 3 colunas → botão "Importar" desabilitado.
- Reimportar o mesmo arquivo → tudo cai em `ignorados` (0 inseridos).
- Sem permissão → `redirect`/`[]`.
- Data/valor inválidos numa linha → a linha é ignorada no parser (não quebra o lote).

## 6. Testes
- **Unit:** `parsearOFX` (SGML e XML; sinal +/−; fitid; DTPOSTED com e sem hora); `cabecalhosCSV`
  (delimitador `;` e `,`); `parsearCSV` (data BR, valor com vírgula/milhar/negativo/parênteses, via mapa);
  `dedupHash` (usa fitid quando há; estável sem fitid).
- **Smoke:** `Conciliacao` renderiza o seletor de conta, o input de arquivo e a tabela de movimentações.

## 7. Migrations
`0064_movimento_bancario.sql` (tabela + RLS + índice). Sem alterar tabelas existentes.
