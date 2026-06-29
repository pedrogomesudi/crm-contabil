# V2 — Integração Domínio → CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar para o CRM o cadastro, o regime tributário e os honorários dos clientes a partir de três relatórios `.xls` exportados do Domínio, com prévia/confirmação, reconciliação por CNPJ e auditoria.

**Architecture:** Camada de parsing pura e testável (`src/lib/dominio/*`) que lê o `.xls` "torto" do Domínio (via `cfb` + parser BIFF tolerante), normaliza e reconcilia por CNPJ; tabelas novas com RLS (contratos seguem o financeiro); server actions fazem upload→prévia (staging) e aplicar (upsert transacional); UI em `/integracoes/dominio`. Fonte de dados abstrata para evoluir a pasta-automática/API depois.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Postgres/RLS) · Zod · Vitest · runner de migrations próprio (`npm run db:migrate`) · novo dep runtime `cfb` (extração OLE2, dos autores da SheetJS).

## Global Constraints

- **Next 16:** middleware é `src/proxy.ts` (função `proxy`); usar alias `@/*` (→ `./src/*`); imagens via `next/image`.
- **RBAC — fonte única:** papel só em `usuarios.papel` via `auth_papel()`; **nunca** ler de `app_metadata`/JWT.
- **Financeiro isolado:** dados com valor (honorário/contrato) **não** podem ser lidos por `assistente` (espelhar a RLS de `clientes_financeiro`).
- **Banco:** sem Docker; schema = `supabase/migrations/NNNN_*.sql` aplicados por `npm run db:migrate` (rastreado em `app_migrations`). **Migrations aplicadas são imutáveis**; novas migrations **idempotentes** (`add column if not exists`, `drop policy if exists; create policy`). Testes de RLS em `supabase/tests/rls.test.sql` via `npm run db:test`.
- **Enums (fonte única `src/lib/tipos.ts`):** `TipoPessoa = PJ|PF|MEI`; `RegimeTributario = Simples|Presumido|Real|MEI|Isento/PF`; `StatusCliente = ativo|inativo`. CHECK tipo×regime: PJ→{Simples,Presumido,Real}, PF→{Isento/PF}, MEI→{MEI}.
- **Coluna de honorário real:** `clientes_financeiro.honorario_mensal` (numeric(12,2)).
- **CNPJ/CPF normalizado:** só dígitos (`replace(/\D/g, "")`), coerente com `clientes.cpf_cnpj` único.
- **LGPD:** o arquivo enviado é processado e **descartado** (nunca salvo no Storage). Os arquivos reais de teste vivem **fora do repo** em `~/dominio-export/` e **não** são commitados. Comandos: rodar `npm run lint && npm run typecheck && npm test` antes de cada commit.
- **Rodar todos os comandos a partir da raiz do repo** `/Users/pedrogomes/crm-contabil` na branch `develop`.

---

## File Structure

**Parsing/lógica (puro, sem DB):**
- `src/lib/dominio/biff.ts` — `parseBiff(workbook: Buffer): FolhaXls[]` (parser BIFF tolerante) e `lerXls(arquivo: Buffer): FolhaXls[]` (cfb + parseBiff).
- `src/lib/dominio/tipos.ts` — tipos das fontes (`EmpresaDominio`, `ContatoDominio`, `ContratoDominio`, `EnderecoDominio`, `TipoArquivoDominio`) e utilitários (`serialParaISO`).
- `src/lib/dominio/detectar.ts` — `detectarTipo(folha: FolhaXls): TipoArquivoDominio`.
- `src/lib/dominio/parseEmpresas.ts` — `parseEmpresas(folha): EmpresaDominio[]`.
- `src/lib/dominio/parseContratos.ts` — `parseContratos(folha): ContratoDominio[]`.
- `src/lib/dominio/parseClientes.ts` — `parseClientes(folha): ContatoDominio[]`.
- `src/lib/dominio/mapear.ts` — `mapearRegime`, `mapearStatus`, `tipoPessoaPorDoc`, `combinarFontes`, tipo `ClienteNormalizado`.
- `src/lib/dominio/reconciliar.ts` — `reconciliarClientes`, tipos `ItemReconc`, `ClienteExistente`.

**Migrations + RLS:**
- `supabase/migrations/0012_clientes_origem_dominio.sql`
- `supabase/migrations/0013_contratos_dominio.sql`
- `supabase/migrations/0014_importacoes.sql`
- (editar) `supabase/tests/rls.test.sql` — asserts novos.

**Server + UI:**
- `src/app/(app)/integracoes/dominio/actions.ts`
- `src/app/(app)/integracoes/dominio/estados.ts`
- `src/app/(app)/integracoes/dominio/page.tsx`
- `src/components/dominio/UploadDominio.tsx`
- `src/components/dominio/PreviaImportacao.tsx`
- (editar) `src/components/Sidebar.tsx`

**Testes (sem dados reais — fixtures sintéticos/anonimizados):**
- `src/tests/dominio/biff.test.ts`
- `src/tests/dominio/detectar.test.ts`
- `src/tests/dominio/parseEmpresas.test.ts`
- `src/tests/dominio/parseContratos.test.ts`
- `src/tests/dominio/parseClientes.test.ts`
- `src/tests/dominio/mapear.test.ts`
- `src/tests/dominio/reconciliar.test.ts`

---

## Task 1: Leitor de `.xls` tolerante (`biff.ts`)

**Files:**
- Create: `src/lib/dominio/biff.ts`
- Test: `src/tests/dominio/biff.test.ts`
- Modify: `package.json` (dep `cfb`)

**Interfaces:**
- Produces: `type CelulaXls = string | number | null`; `type FolhaXls = { nome: string; celulas: CelulaXls[][] }`; `export function parseBiff(workbook: Buffer): FolhaXls[]`; `export function lerXls(arquivo: Buffer): FolhaXls[]`.

- [ ] **Step 1: Instalar dependência `cfb`**

Run: `npm install cfb@1.2.2`
Expected: `package.json` passa a listar `"cfb"` em dependencies; `npm install` conclui sem erro.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/tests/dominio/biff.test.ts
import { describe, it, expect } from "vitest";
import { parseBiff } from "@/lib/dominio/biff";

// Monta um stream "Workbook" BIFF8 mínimo: BOF(globals) + SST(2 strings) +
// BOF(worksheet) + LABELSST(0,0->str0) + NUMBER(1,0->123) + EOF.
function rec(type: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(payload.length, 2);
  return Buffer.concat([head, payload]);
}
function str8(s: string): Buffer {
  const b = Buffer.alloc(3 + s.length);
  b.writeUInt16LE(s.length, 0); // cch
  b.writeUInt8(0, 2); // grbit: 8-bit, sem rich/ext
  b.write(s, 3, "latin1");
  return b;
}
function buildWorkbook(): Buffer {
  const bofGlobals = rec(0x0809, Buffer.concat([Buffer.from([0x00, 0x06, 0x05, 0x00]), Buffer.alloc(12)]));
  const sstPayload = Buffer.concat([
    (() => { const b = Buffer.alloc(8); b.writeInt32LE(2, 0); b.writeInt32LE(2, 4); return b; })(),
    str8("CNPJ"),
    str8("Empresa"),
  ]);
  const sst = rec(0x00fc, sstPayload);
  const bofSheet = rec(0x0809, Buffer.concat([Buffer.from([0x00, 0x06, 0x10, 0x00]), Buffer.alloc(12)]));
  const labelsst = (() => { const b = Buffer.alloc(10); b.writeUInt16LE(0, 0); b.writeUInt16LE(0, 2); b.writeUInt16LE(0, 4); b.writeInt32LE(0, 6); return rec(0x00fd, b); })();
  const number = (() => { const b = Buffer.alloc(14); b.writeUInt16LE(1, 0); b.writeUInt16LE(0, 2); b.writeUInt16LE(0, 4); b.writeDoubleLE(123, 6); return rec(0x0203, b); })();
  const eof = rec(0x000a, Buffer.alloc(0));
  return Buffer.concat([bofGlobals, sst, bofSheet, labelsst, number, eof]);
}

describe("parseBiff", () => {
  it("lê células de texto (LABELSST via SST) e número (NUMBER)", () => {
    const folhas = parseBiff(buildWorkbook());
    expect(folhas.length).toBe(1);
    expect(folhas[0].celulas[0][0]).toBe("CNPJ");
    expect(folhas[0].celulas[1][0]).toBe(123);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- src/tests/dominio/biff.test.ts`
Expected: FALHA com erro de import (`parseBiff` não existe).

- [ ] **Step 4: Implementar `biff.ts`** (porte do parser tolerante validado nesta sessão)

```ts
// src/lib/dominio/biff.ts
import * as CFB from "cfb";

export type CelulaXls = string | number | null;
export type FolhaXls = { nome: string; celulas: CelulaXls[][] };

type Registro = { tipo: number; dados: Buffer };

function lerRegistros(buf: Buffer): Registro[] {
  const out: Registro[] = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const tipo = buf.readUInt16LE(i);
    const len = buf.readUInt16LE(i + 2);
    i += 4;
    out.push({ tipo, dados: buf.subarray(i, i + len) });
    i += len;
  }
  return out;
}

// SST com tratamento de CONTINUE (re-leitura do flag de codificação na borda).
function parseSST(payload: Buffer, continues: Buffer[]): string[] {
  const chunks = [payload, ...continues];
  let ci = 0, off = 0;
  const garante = () => { while (ci < chunks.length && off >= chunks[ci].length) { ci++; off = 0; } return ci < chunks.length; };
  const rd = (k: number): Buffer => {
    const parts: Buffer[] = [];
    while (k > 0 && garante()) {
      const take = Math.min(k, chunks[ci].length - off);
      parts.push(chunks[ci].subarray(off, off + take));
      off += take; k -= take;
    }
    return Buffer.concat(parts);
  };
  const total = rd(8); void total; // cstTotal/cstUnique
  const unique = total.length >= 8 ? total.readInt32LE(4) : 0;
  const strings: string[] = [];
  for (let n = 0; n < unique; n++) {
    if (!garante()) break;
    const cch = rd(2).readUInt16LE(0);
    const grbit = rd(1)[0];
    const rich = grbit & 0x08 ? rd(2).readUInt16LE(0) : 0;
    const ext = grbit & 0x04 ? rd(4).readInt32LE(0) : 0;
    let high = grbit & 0x01;
    let restante = cch;
    const pedacos: string[] = [];
    while (restante > 0) {
      if (!garante()) break;
      if (off === 0 && ci !== 0) high = rd(1)[0] & 0x01; // borda de CONTINUE: novo flag
      if (high) { const b = rd(2); if (b.length < 2) break; pedacos.push(b.toString("utf16le")); }
      else { const b = rd(1); if (b.length < 1) break; pedacos.push(b.toString("latin1")); }
      restante--;
    }
    if (rich) rd(4 * rich);
    if (ext) rd(ext);
    strings.push(pedacos.join(""));
  }
  return strings;
}

function rkParaNumero(rk: number): number {
  const centavos = rk & 0x01;
  const inteiro = rk & 0x02;
  const base = rk & 0xfffffffc;
  let num: number;
  if (inteiro) {
    num = base >> 2;
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE(base >>> 0, 4);
    num = b.readDoubleLE(0);
  }
  return centavos ? num / 100 : num;
}

export function parseBiff(workbook: Buffer): FolhaXls[] {
  const recs = lerRegistros(workbook);
  let sst: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].tipo === 0x00fc) {
      const conts: Buffer[] = [];
      let j = i + 1;
      while (j < recs.length && recs[j].tipo === 0x003c) { conts.push(recs[j].dados); j++; }
      sst = parseSST(recs[i].dados, conts);
      break;
    }
  }
  const folhas: FolhaXls[] = [];
  let atual: Map<number, Map<number, CelulaXls>> | null = null;
  const set = (r: number, c: number, v: CelulaXls) => {
    if (!atual) return;
    if (!atual.has(r)) atual.set(r, new Map());
    atual.get(r)!.set(c, v);
  };
  for (const { tipo, dados: d } of recs) {
    if (tipo === 0x0809) {
      const dt = d.length >= 4 ? d.readUInt16LE(2) : 0;
      if (dt === 0x0010) { atual = new Map(); folhas.push({ nome: `Folha${folhas.length + 1}`, celulas: [] as CelulaXls[][], __m: atual } as unknown as FolhaXls); }
      continue;
    }
    if (!atual) continue;
    if (tipo === 0x00fd && d.length >= 10) { set(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readInt32LE(6)] ?? ""); }
    else if (tipo === 0x0204 && d.length >= 9) { // LABEL (string inline)
      const r = d.readUInt16LE(0), c = d.readUInt16LE(2), cch = d.readUInt16LE(6), g = d[8];
      set(r, c, g & 1 ? d.subarray(9, 9 + 2 * cch).toString("utf16le") : d.subarray(9, 9 + cch).toString("latin1"));
    } else if (tipo === 0x027e && d.length >= 10) { set(d.readUInt16LE(0), d.readUInt16LE(2), rkParaNumero(d.readUInt32LE(6))); }
    else if (tipo === 0x0203 && d.length >= 14) { set(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6)); }
    else if (tipo === 0x00bd) { // MULRK
      const r = d.readUInt16LE(0), cf = d.readUInt16LE(2), cl = d.readUInt16LE(d.length - 2);
      let p = 4;
      for (let c = cf; c <= cl; c++) { set(r, c, rkParaNumero(d.readUInt32LE(p + 2))); p += 6; }
    }
  }
  // materializa o Map -> matriz densa
  return folhas.map((f) => {
    const m = (f as unknown as { __m: Map<number, Map<number, CelulaXls>> }).__m;
    const maxR = Math.max(-1, ...m.keys());
    let maxC = -1;
    for (const linha of m.values()) maxC = Math.max(maxC, ...linha.keys());
    const celulas: CelulaXls[][] = [];
    for (let r = 0; r <= maxR; r++) {
      const linha: CelulaXls[] = [];
      const lm = m.get(r);
      for (let c = 0; c <= maxC; c++) linha.push(lm?.get(c) ?? null);
      celulas.push(linha);
    }
    return { nome: f.nome, celulas };
  });
}

export function lerXls(arquivo: Buffer): FolhaXls[] {
  const cfb = CFB.read(arquivo, { type: "buffer" });
  const entry = CFB.find(cfb, "Workbook") || CFB.find(cfb, "Book");
  if (!entry || !entry.content) throw new Error("Arquivo .xls inválido: stream Workbook não encontrado");
  const content = entry.content as Uint8Array;
  return parseBiff(Buffer.from(content));
}
```

> Nota de implementação: o campo auxiliar `__m` é apenas interno (Map por folha) e some na materialização final; se o `tsc` reclamar, declarar `folhas` como `(FolhaXls & { __m?: ... })[]` e remover `__m` no `map`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- src/tests/dominio/biff.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 6: Verificar contra os arquivos REAIS (gate manual; fora do repo)**

Run:
```bash
node --input-type=module -e '
import { lerXls } from "./src/lib/dominio/biff.ts";
import { readFileSync } from "node:fs";
for (const f of ["Relação de Regime de Empresas.xls","Relação de Contratos.xls","Clientes.xls"]) {
  const folhas = lerXls(readFileSync(process.env.HOME+"/dominio-export/"+f));
  console.log(f, "->", folhas[0].celulas.length, "linhas");
}'
```
> Se o Node não executar `.ts` direto neste ambiente, validar via um teste temporário (não commitado) ou após o build. Esperado: ~130 / ~91 / ~1052 linhas respectivamente. **Não commitar nada com dados reais.**

- [ ] **Step 7: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio/biff.test.ts
git add package.json package-lock.json src/lib/dominio/biff.ts src/tests/dominio/biff.test.ts
git commit -m "feat(dominio): leitor .xls tolerante (cfb + parser BIFF)"
```

---

## Task 2: Tipos e detecção de arquivo (`tipos.ts`, `detectar.ts`)

**Files:**
- Create: `src/lib/dominio/tipos.ts`, `src/lib/dominio/detectar.ts`
- Test: `src/tests/dominio/detectar.test.ts`

**Interfaces:**
- Consumes: `FolhaXls` (Task 1).
- Produces: tipos `EmpresaDominio`, `ContatoDominio`, `ContratoDominio`, `EnderecoDominio`, `TipoArquivoDominio = "empresas" | "clientes" | "contratos" | "desconhecido"`; `export function serialParaISO(n: number): string | null`; `export function detectarTipo(folha: FolhaXls): TipoArquivoDominio`.

- [ ] **Step 1: Escrever `tipos.ts`** (sem teste próprio — exercitado pelos parsers)

```ts
// src/lib/dominio/tipos.ts
export type EnderecoDominio = {
  logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string; cep?: string; pais?: string;
};
export type EmpresaDominio = {
  codigo: number; razaoSocial: string; cnpj: string;
  status: string; cnae: string | null; regimeDominio: string; inscricaoEstadual: string | null;
};
export type ContatoDominio = {
  codigo: number; nome: string; apelido: string | null; cnpj: string | null;
  endereco: EnderecoDominio | null; email: string | null; telefone: string | null;
};
export type ContratoDominio = {
  codigoCliente: number; clienteNome: string; tipoContrato: string;
  emissao: string | null; inicioContrato: string | null; inicioFaturamento: string | null;
  diaVencimento: string | null; encerradoEm: string | null;
  valorOriginal: number | null; valorAtual: number | null;
};
export type TipoArquivoDominio = "empresas" | "clientes" | "contratos" | "desconhecido";

// Serial do Excel (base 1899-12-30) -> "YYYY-MM-DD". Ignora a fração de hora.
export function serialParaISO(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.floor(n) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}
export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}
```

- [ ] **Step 2: Escrever o teste de detecção que falha**

```ts
// src/tests/dominio/detectar.test.ts
import { describe, it, expect } from "vitest";
import { detectarTipo } from "@/lib/dominio/detectar";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha = (celulas: (string | number | null)[][]): FolhaXls => ({ nome: "F", celulas });

describe("detectarTipo", () => {
  it("detecta empresas pelos títulos da tabela", () => {
    const f = folha([[null], [null], ["Relação de R..."], [null], ["Cód.", "Empresa", "CNPJ", "Status", "CNAE Principal", "Regime Tributário "]]);
    expect(detectarTipo(f)).toBe("empresas");
  });
  it("detecta contratos", () => {
    const f = folha([["RELAÇÃO DE CONTRATOS"], [null], [null], [null], ["Código", "Cliente", null, null, null, null, null, "Tipo de contrato"]]);
    expect(detectarTipo(f)).toBe("contratos");
  });
  it("detecta clientes (ficha) pelo rótulo Apelido:/Empresa:", () => {
    const f = folha([["CLIENTES"], ["Código:", 1], ["Apelido:", "X"], ["Empresa:", "32 - X"]]);
    expect(detectarTipo(f)).toBe("clientes");
  });
  it("retorna desconhecido para conteúdo estranho", () => {
    expect(detectarTipo(folha([["foo", "bar"]]))).toBe("desconhecido");
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/detectar.test.ts`
Expected: FALHA (módulo `detectar` inexistente).

- [ ] **Step 4: Implementar `detectar.ts`**

```ts
// src/lib/dominio/detectar.ts
import type { FolhaXls } from "./biff";
import type { TipoArquivoDominio } from "./tipos";

function textoDe(folha: FolhaXls, ateLinha = 12): string {
  return folha.celulas.slice(0, ateLinha).flat().map((c) => String(c ?? "").toLowerCase()).join("|");
}

export function detectarTipo(folha: FolhaXls): TipoArquivoDominio {
  const t = textoDe(folha);
  const temEmpresa = t.includes("empresa");
  if (t.includes("cnae") && t.includes("regime tribut") && temEmpresa) return "empresas";
  if (t.includes("tipo de contrato") || t.includes("relação de contratos")) return "contratos";
  if (t.includes("apelido:") || (t.includes("código:") && temEmpresa)) return "clientes";
  return "desconhecido";
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/detectar.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio
git add src/lib/dominio/tipos.ts src/lib/dominio/detectar.ts src/tests/dominio/detectar.test.ts
git commit -m "feat(dominio): tipos das fontes + detecção do tipo de arquivo"
```

---

## Task 3: Parser de Empresas (`parseEmpresas.ts`)

**Files:**
- Create: `src/lib/dominio/parseEmpresas.ts`
- Test: `src/tests/dominio/parseEmpresas.test.ts`

**Interfaces:**
- Consumes: `FolhaXls`, `EmpresaDominio`, `soDigitos`.
- Produces: `export function parseEmpresas(folha: FolhaXls): EmpresaDominio[]`.

Colunas reais (linha de títulos L4): `0 Cód. · 1 Empresa · 2 CNPJ · 3 Status · 4 CNAE Principal · 5 Regime Tributário · 6 Apuração · 7 Últ. Vigência · 8 Inscrição Estadual`. Linhas de dados têm número na col 0.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/dominio/parseEmpresas.test.ts
import { describe, it, expect } from "vitest";
import { parseEmpresas } from "@/lib/dominio/parseEmpresas";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha: FolhaXls = { nome: "F", celulas: [
  [null, null, null, null, null, null, null, null, "Página: 1/4"],
  [null], [null], [null],
  ["Cód.", "Empresa", "CNPJ", "Status", "CNAE Principal", "Regime Tributário ", "Apuração", "Últ. Vigência", "Inscrição Estadual"],
  [1, "ACME LTDA", "11.222.333/0001-81", "Ativa", "8211300", "Lucro Presumido", "Competência", "07/2024", ""],
  [2, "BETA ME", "11222333000262", "Inativa", "9999999", "Microempresa", "Competência", "06/2023", "123456"],
]};

describe("parseEmpresas", () => {
  it("extrai empresas com CNPJ só-dígitos e campos-chave", () => {
    const r = parseEmpresas(folha);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ codigo: 1, razaoSocial: "ACME LTDA", cnpj: "11222333000181", status: "Ativa", regimeDominio: "Lucro Presumido", cnae: "8211300", inscricaoEstadual: null });
    expect(r[1]).toMatchObject({ codigo: 2, cnpj: "11222333000262", status: "Inativa", regimeDominio: "Microempresa", inscricaoEstadual: "123456" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/parseEmpresas.test.ts`
Expected: FALHA (módulo inexistente).

- [ ] **Step 3: Implementar `parseEmpresas.ts`**

```ts
// src/lib/dominio/parseEmpresas.ts
import type { FolhaXls } from "./biff";
import type { EmpresaDominio } from "./tipos";
import { soDigitos } from "./tipos";

const txt = (v: unknown): string => String(v ?? "").trim();
const ou = (s: string): string | null => (s ? s : null);

export function parseEmpresas(folha: FolhaXls): EmpresaDominio[] {
  const out: EmpresaDominio[] = [];
  for (const linha of folha.celulas) {
    const cod = linha[0];
    if (typeof cod !== "number") continue; // pula cabeçalho/rodapé
    const cnpj = soDigitos(linha[2]);
    if (cnpj.length !== 14) continue;
    out.push({
      codigo: cod,
      razaoSocial: txt(linha[1]),
      cnpj,
      status: txt(linha[3]),
      cnae: ou(txt(linha[4])),
      regimeDominio: txt(linha[5]),
      inscricaoEstadual: ou(soDigitos(linha[8])),
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/parseEmpresas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio
git add src/lib/dominio/parseEmpresas.ts src/tests/dominio/parseEmpresas.test.ts
git commit -m "feat(dominio): parser de Relação de Regime de Empresas"
```

---

## Task 4: Parser de Contratos (`parseContratos.ts`)

**Files:**
- Create: `src/lib/dominio/parseContratos.ts`
- Test: `src/tests/dominio/parseContratos.test.ts`

**Interfaces:**
- Consumes: `FolhaXls`, `ContratoDominio`, `serialParaISO`.
- Produces: `export function parseContratos(folha: FolhaXls): ContratoDominio[]`.

Colunas reais: `0 Código · 1 Cliente · 7 Tipo de contrato · 9 Emissão · 11 Início contrato · 12 Início faturamento · 14 Dia venc. · 20 Encerrado em · 21 Valor original · 22 Valor atual`. Datas são serial do Excel; linhas de dados têm número na col 0.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/dominio/parseContratos.test.ts
import { describe, it, expect } from "vitest";
import { parseContratos } from "@/lib/dominio/parseContratos";
import type { FolhaXls } from "@/lib/dominio/biff";

const L = (o: Record<number, string | number>): (string | number | null)[] => {
  const a: (string | number | null)[] = Array(23).fill(null);
  for (const k of Object.keys(o)) a[Number(k)] = o[Number(k)];
  return a;
};
const folha: FolhaXls = { nome: "F", celulas: [
  ["RELAÇÃO DE CONTRATOS"], [null], [null], [null],
  L({ 0: "Código", 1: "Cliente", 7: "Tipo de contrato", 21: "Valor", 22: "Valor" }),
  L({ 9: "contrato", 11: "contrato", 21: "original", 22: "atual" }),
  L({ 0: 1, 1: "ACME LTDA", 7: "HONORARIOS CONTABEIS", 9: 45931, 11: 45931, 12: 45931, 14: "10", 21: 200, 22: 250 }),
]};

describe("parseContratos", () => {
  it("extrai contratos e converte datas seriais", () => {
    const r = parseContratos(folha);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      codigoCliente: 1, clienteNome: "ACME LTDA", tipoContrato: "HONORARIOS CONTABEIS",
      emissao: "2025-10-01", inicioContrato: "2025-10-01", inicioFaturamento: "2025-10-01",
      diaVencimento: "10", valorOriginal: 200, valorAtual: 250, encerradoEm: null,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/parseContratos.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `parseContratos.ts`**

```ts
// src/lib/dominio/parseContratos.ts
import type { FolhaXls } from "./biff";
import type { ContratoDominio } from "./tipos";
import { serialParaISO } from "./tipos";

const txt = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s ? s : null; };
const data = (v: unknown): string | null => (typeof v === "number" ? serialParaISO(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function parseContratos(folha: FolhaXls): ContratoDominio[] {
  const out: ContratoDominio[] = [];
  for (const linha of folha.celulas) {
    const cod = linha[0];
    if (typeof cod !== "number") continue;
    out.push({
      codigoCliente: cod,
      clienteNome: txt(linha[1]) ?? "",
      tipoContrato: txt(linha[7]) ?? "",
      emissao: data(linha[9]),
      inicioContrato: data(linha[11]),
      inicioFaturamento: data(linha[12]),
      diaVencimento: linha[14] != null ? String(linha[14]).trim() : null,
      encerradoEm: data(linha[20]),
      valorOriginal: num(linha[21]),
      valorAtual: num(linha[22]),
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/parseContratos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio
git add src/lib/dominio/parseContratos.ts src/tests/dominio/parseContratos.test.ts
git commit -m "feat(dominio): parser de Relação de Contratos (com datas seriais)"
```

---

## Task 5: Parser de Clientes/Honorários (`parseClientes.ts`)

**Files:**
- Create: `src/lib/dominio/parseClientes.ts`
- Test: `src/tests/dominio/parseClientes.test.ts`

**Interfaces:**
- Consumes: `FolhaXls`, `ContatoDominio`, `EnderecoDominio`, `soDigitos`.
- Produces: `export function parseClientes(folha: FolhaXls): ContatoDominio[]`.

Layout de **ficha** (1 cliente por bloco), iniciado por `Código:` na col 0. Os campos são `rótulo: valor`, com o rótulo na col 0 **ou** col 5 e o valor na célula à direita. O documento do cliente está em **`Inscrição:`** (NUNCA em `C.N.P.J.:`, que é o do escritório no cabeçalho). Endereço composto de `Endereço:`/`Número:`/`Complemento:`/`Bairro:`/`Município:`/`UF:`/`CEP:`/`País:`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/dominio/parseClientes.test.ts
import { describe, it, expect } from "vitest";
import { parseClientes } from "@/lib/dominio/parseClientes";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha: FolhaXls = { nome: "F", celulas: [
  ["ACME CONTABILIDADE", null, null, null, null, null, null, null, null, null, "Página:", null, null, "1/22"],
  ["C.N.P.J.:", null, "99999999000199", null, null, null, null, null, null, null, "Emissão:"], // header do escritório — ignorar
  ["CLIENTES"],
  ["Código:", 1, null, null, null, "País:", "BRASIL"],
  ["Apelido:", "FULANO", null, null, null, "CEP:", "38407162"],
  ["Nome:", "FULANO DE TAL LTDA", null, null, null, "Telefone:", "34 999990000"],
  ["Endereço:", "Rua", null, "DAS FLORES", null, "E-mail:", "f@ex.com"],
  ["Número:", 127, null, null, null, "Inscrição:", "11222333000181"],
  ["Bairro:", "CENTRO", null, null, null, null],
  ["Município:", "UBERLANDIA", null, null, null, null],
  ["UF:", "MINAS GERAIS", null, null, null, null],
  // segunda ficha
  ["Código:", 2, null, null, null, null],
  ["Nome:", "BETA SERVICOS LTDA", null, null, null, "Inscrição:", "11222333000262"],
]};

describe("parseClientes", () => {
  it("extrai fichas, usa Inscrição como documento e compõe endereço", () => {
    const r = parseClientes(folha);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      codigo: 1, nome: "FULANO DE TAL LTDA", apelido: "FULANO",
      cnpj: "11222333000181", email: "f@ex.com", telefone: "34 999990000",
    });
    expect(r[0].endereco).toMatchObject({ logradouro: "Rua DAS FLORES", numero: "127", bairro: "CENTRO", cidade: "UBERLANDIA", uf: "MINAS GERAIS", cep: "38407162", pais: "BRASIL" });
    expect(r[0].cnpj).not.toBe("99999999000199"); // nunca o CNPJ do escritório
    expect(r[1]).toMatchObject({ codigo: 2, nome: "BETA SERVICOS LTDA", cnpj: "11222333000262" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/parseClientes.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `parseClientes.ts`**

```ts
// src/lib/dominio/parseClientes.ts
import type { CelulaXls, FolhaXls } from "./biff";
import type { ContatoDominio, EnderecoDominio } from "./tipos";
import { soDigitos } from "./tipos";

type Linha = CelulaXls[];

// Valor imediatamente à direita de um rótulo (col 0 ou col 5), na mesma linha.
function valorDoRotulo(linha: Linha, rotulo: string): string | null {
  for (const base of [0, 5]) {
    if (String(linha[base] ?? "").trim() === rotulo) {
      for (let c = base + 1; c < base + 5; c++) {
        const v = String(linha[c] ?? "").trim();
        if (v) return v;
      }
    }
  }
  return null;
}
function buscar(bloco: Linha[], rotulo: string): string | null {
  for (const l of bloco) { const v = valorDoRotulo(l, rotulo); if (v != null) return v; }
  return null;
}
function montarEndereco(bloco: Linha[]): EnderecoDominio | null {
  const tipoLog = buscar(bloco, "Endereço:");
  const nomeLog = (() => {
    for (const l of bloco) {
      if (String(l[0] ?? "").trim() === "Endereço:") { const v = String(l[3] ?? "").trim(); if (v) return v; }
    }
    return null;
  })();
  const e: EnderecoDominio = {};
  const log = [tipoLog, nomeLog].filter(Boolean).join(" ").trim();
  if (log) e.logradouro = log;
  const num = buscar(bloco, "Número:"); if (num) e.numero = num;
  const comp = buscar(bloco, "Complemento:"); if (comp) e.complemento = comp;
  const bairro = buscar(bloco, "Bairro:"); if (bairro) e.bairro = bairro;
  const cidade = buscar(bloco, "Município:"); if (cidade) e.cidade = cidade;
  const uf = buscar(bloco, "UF:"); if (uf) e.uf = uf;
  const cep = buscar(bloco, "CEP:"); if (cep) e.cep = cep;
  const pais = buscar(bloco, "País:"); if (pais) e.pais = pais;
  return Object.keys(e).length ? e : null;
}

export function parseClientes(folha: FolhaXls): ContatoDominio[] {
  // agrupa linhas em blocos iniciados por "Código:"
  const blocos: Linha[][] = [];
  let atual: Linha[] | null = null;
  for (const l of folha.celulas) {
    if (String(l[0] ?? "").trim() === "Código:") { if (atual) blocos.push(atual); atual = []; }
    if (atual) atual.push(l);
  }
  if (atual) blocos.push(atual);

  const out: ContatoDominio[] = [];
  for (const bloco of blocos) {
    const codStr = valorDoRotulo(bloco[0], "Código:");
    const codigo = Number(codStr);
    if (!Number.isFinite(codigo)) continue;
    const docDigitos = soDigitos(buscar(bloco, "Inscrição:") ?? "");
    out.push({
      codigo,
      nome: buscar(bloco, "Nome:") ?? "",
      apelido: buscar(bloco, "Apelido:"),
      cnpj: docDigitos.length >= 11 ? docDigitos : null,
      endereco: montarEndereco(bloco),
      email: buscar(bloco, "E-mail:"),
      telefone: buscar(bloco, "Telefone:") ?? buscar(bloco, "Celular:"),
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/parseClientes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio
git add src/lib/dominio/parseClientes.ts src/tests/dominio/parseClientes.test.ts
git commit -m "feat(dominio): parser de Clientes (ficha; Inscrição como documento)"
```

---

## Task 6: Mapeamento e combinação de fontes (`mapear.ts`)

**Files:**
- Create: `src/lib/dominio/mapear.ts`
- Test: `src/tests/dominio/mapear.test.ts`

**Interfaces:**
- Consumes: `EmpresaDominio`, `ContatoDominio`, `EnderecoDominio`; enums de `@/lib/tipos` (`RegimeTributario`, `StatusCliente`, `TipoPessoa`).
- Produces:
  - `type ClienteNormalizado = { cpf_cnpj: string; tipo_pessoa: TipoPessoa; razao_social: string; nome_fantasia: string | null; regime_tributario: RegimeTributario | null; status: StatusCliente; cnae: string | null; inscricao_estadual: string | null; endereco: EnderecoDominio | null; email: string | null; telefone: string | null; dominio_codigo: string | null; pendencias: string[] }`
  - `export function mapearRegime(regimeDominio: string): { regime: RegimeTributario | null; pendencia: string | null }`
  - `export function mapearStatus(status: string): StatusCliente`
  - `export function tipoPessoaPorDoc(doc: string): TipoPessoa | null`
  - `export function combinarFontes(empresas: EmpresaDominio[], contatos: ContatoDominio[]): ClienteNormalizado[]`

Regras: Microempresa→Simples; "Lucro Presumido"→Presumido; "Lucro Real"→Real; "Imune"/"Isenta"→`null`+pendência. Status: "Inativa"→inativo; demais→ativo. Doc 14→PJ, 11→PF. **Junção por CNPJ**: empresa é a base; contato (por CNPJ) acrescenta endereço/contato/`dominio_codigo`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/dominio/mapear.test.ts
import { describe, it, expect } from "vitest";
import { mapearRegime, mapearStatus, tipoPessoaPorDoc, combinarFontes } from "@/lib/dominio/mapear";
import type { EmpresaDominio, ContatoDominio } from "@/lib/dominio/tipos";

describe("mapearRegime", () => {
  it("mapeia os regimes conhecidos", () => {
    expect(mapearRegime("Microempresa").regime).toBe("Simples");
    expect(mapearRegime("Lucro Presumido").regime).toBe("Presumido");
    expect(mapearRegime("Lucro Real").regime).toBe("Real");
  });
  it("gera pendência para imune/isenta", () => {
    const r = mapearRegime("Imune do IRPJ");
    expect(r.regime).toBeNull();
    expect(r.pendencia).toMatch(/regime/i);
  });
});

describe("tipoPessoaPorDoc", () => {
  it("14 díg => PJ, 11 díg => PF, outro => null", () => {
    expect(tipoPessoaPorDoc("11222333000181")).toBe("PJ");
    expect(tipoPessoaPorDoc("52998224725")).toBe("PF");
    expect(tipoPessoaPorDoc("123")).toBeNull();
  });
});

describe("mapearStatus", () => {
  it("Inativa => inativo; resto => ativo", () => {
    expect(mapearStatus("Inativa")).toBe("inativo");
    expect(mapearStatus("Ativa")).toBe("ativo");
    expect(mapearStatus("Ativa - Sem movimento")).toBe("ativo");
  });
});

describe("combinarFontes", () => {
  const empresas: EmpresaDominio[] = [
    { codigo: 1, razaoSocial: "ACME LTDA", cnpj: "11222333000181", status: "Ativa", cnae: "8211300", regimeDominio: "Lucro Presumido", inscricaoEstadual: null },
    { codigo: 2, razaoSocial: "BETA ME", cnpj: "11222333000262", status: "Inativa", cnae: null, regimeDominio: "Imune do IRPJ", inscricaoEstadual: null },
  ];
  const contatos: ContatoDominio[] = [
    { codigo: 7, nome: "ACME LTDA", apelido: "ACME", cnpj: "11222333000181", endereco: { cidade: "UBERLANDIA" }, email: "a@ex.com", telefone: "34 1", },
  ];
  it("junta por CNPJ: empresa base + contato enriquece; classifica pendências", () => {
    const r = combinarFontes(empresas, contatos);
    const acme = r.find((c) => c.cpf_cnpj === "11222333000181")!;
    expect(acme).toMatchObject({ tipo_pessoa: "PJ", regime_tributario: "Presumido", status: "ativo", cnae: "8211300", nome_fantasia: "ACME", email: "a@ex.com", dominio_codigo: "7" });
    expect(acme.endereco).toMatchObject({ cidade: "UBERLANDIA" });
    const beta = r.find((c) => c.cpf_cnpj === "11222333000262")!;
    expect(beta.regime_tributario).toBeNull();
    expect(beta.pendencias.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/mapear.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `mapear.ts`**

```ts
// src/lib/dominio/mapear.ts
import type { RegimeTributario, StatusCliente, TipoPessoa } from "@/lib/tipos";
import type { EmpresaDominio, ContatoDominio, EnderecoDominio } from "./tipos";

export type ClienteNormalizado = {
  cpf_cnpj: string;
  tipo_pessoa: TipoPessoa;
  razao_social: string;
  nome_fantasia: string | null;
  regime_tributario: RegimeTributario | null;
  status: StatusCliente;
  cnae: string | null;
  inscricao_estadual: string | null;
  endereco: EnderecoDominio | null;
  email: string | null;
  telefone: string | null;
  dominio_codigo: string | null;
  pendencias: string[];
};

export function mapearRegime(regimeDominio: string): { regime: RegimeTributario | null; pendencia: string | null } {
  const r = regimeDominio.toLowerCase();
  if (r.includes("microempresa") || r.includes("simples") || r.includes("epp")) return { regime: "Simples", pendencia: null };
  if (r.includes("presumido")) return { regime: "Presumido", pendencia: null };
  if (r.includes("real")) return { regime: "Real", pendencia: null };
  return { regime: null, pendencia: `Regime "${regimeDominio}" sem equivalente — revisar` };
}

export function mapearStatus(status: string): StatusCliente {
  return status.trim().toLowerCase().startsWith("inativa") ? "inativo" : "ativo";
}

export function tipoPessoaPorDoc(doc: string): TipoPessoa | null {
  if (doc.length === 14) return "PJ";
  if (doc.length === 11) return "PF";
  return null;
}

export function combinarFontes(empresas: EmpresaDominio[], contatos: ContatoDominio[]): ClienteNormalizado[] {
  const porCnpj = new Map<string, ContatoDominio>();
  for (const c of contatos) if (c.cnpj) porCnpj.set(c.cnpj, c);

  const out: ClienteNormalizado[] = [];
  for (const e of empresas) {
    const contato = porCnpj.get(e.cnpj) ?? null;
    const pend: string[] = [];
    const tipo = tipoPessoaPorDoc(e.cnpj);
    if (!tipo) pend.push("Documento inválido (não é CPF nem CNPJ)");
    const { regime, pendencia } = mapearRegime(e.regimeDominio);
    if (pendencia) pend.push(pendencia);
    out.push({
      cpf_cnpj: e.cnpj,
      tipo_pessoa: tipo ?? "PJ",
      razao_social: e.razaoSocial,
      nome_fantasia: contato?.apelido ?? null,
      regime_tributario: regime,
      status: mapearStatus(e.status),
      cnae: e.cnae,
      inscricao_estadual: e.inscricaoEstadual,
      endereco: contato?.endereco ?? null,
      email: contato?.email ?? null,
      telefone: contato?.telefone ?? null,
      dominio_codigo: contato ? String(contato.codigo) : null,
      pendencias: pend,
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/mapear.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/dominio
git add src/lib/dominio/mapear.ts src/tests/dominio/mapear.test.ts
git commit -m "feat(dominio): mapeamento de regime/status/tipo + junção por CNPJ"
```

---

## Task 7: Reconciliação (`reconciliar.ts`)

**Files:**
- Create: `src/lib/dominio/reconciliar.ts`
- Test: `src/tests/dominio/reconciliar.test.ts`

**Interfaces:**
- Consumes: `ClienteNormalizado` (Task 6).
- Produces:
  - `type ClienteExistente = { cpf_cnpj: string; razao_social: string; regime_tributario: string | null; status: string; email: string | null; telefone: string | null }`
  - `type ClasseReconc = "novo" | "atualizado" | "inalterado" | "pendencia"`
  - `type ItemReconc = { classe: ClasseReconc; cliente: ClienteNormalizado; diff: Record<string, [unknown, unknown]> }`
  - `export function reconciliarClientes(novos: ClienteNormalizado[], existentes: ClienteExistente[]): ItemReconc[]`

Regra: itens com `pendencias.length>0` → classe `pendencia`. Senão, casa por `cpf_cnpj`: ausente→`novo`; presente com diferença em campos comparados (razao_social, regime_tributario, status, email, telefone)→`atualizado` (com `diff`); igual→`inalterado`. Idempotência: reaplicar dados iguais → tudo `inalterado`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/dominio/reconciliar.test.ts
import { describe, it, expect } from "vitest";
import { reconciliarClientes, type ClienteExistente } from "@/lib/dominio/reconciliar";
import type { ClienteNormalizado } from "@/lib/dominio/mapear";

const norm = (over: Partial<ClienteNormalizado>): ClienteNormalizado => ({
  cpf_cnpj: "11222333000181", tipo_pessoa: "PJ", razao_social: "ACME LTDA", nome_fantasia: null,
  regime_tributario: "Simples", status: "ativo", cnae: null, inscricao_estadual: null,
  endereco: null, email: null, telefone: null, dominio_codigo: null, pendencias: [], ...over,
});

describe("reconciliarClientes", () => {
  it("classifica novo / atualizado / inalterado / pendencia", () => {
    const existentes: ClienteExistente[] = [
      { cpf_cnpj: "11222333000181", razao_social: "ACME LTDA", regime_tributario: "Simples", status: "ativo", email: "old@ex.com", telefone: null },
      { cpf_cnpj: "11222333000262", razao_social: "BETA", regime_tributario: "Presumido", status: "ativo", email: null, telefone: null },
    ];
    const novos = [
      norm({ cpf_cnpj: "11222333000181", email: "new@ex.com" }), // atualizado (email)
      norm({ cpf_cnpj: "11222333000262", razao_social: "BETA", regime_tributario: "Presumido" }), // inalterado
      norm({ cpf_cnpj: "99999999000199", razao_social: "NOVA" }), // novo
      norm({ cpf_cnpj: "00000000000000", pendencias: ["x"] }), // pendencia
    ];
    const r = reconciliarClientes(novos, existentes);
    const classe = (cnpj: string) => r.find((i) => i.cliente.cpf_cnpj === cnpj)!.classe;
    expect(classe("11222333000181")).toBe("atualizado");
    expect(r.find((i) => i.cliente.cpf_cnpj === "11222333000181")!.diff.email).toEqual(["old@ex.com", "new@ex.com"]);
    expect(classe("11222333000262")).toBe("inalterado");
    expect(classe("99999999000199")).toBe("novo");
    expect(classe("00000000000000")).toBe("pendencia");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/dominio/reconciliar.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `reconciliar.ts`**

```ts
// src/lib/dominio/reconciliar.ts
import type { ClienteNormalizado } from "./mapear";

export type ClienteExistente = {
  cpf_cnpj: string; razao_social: string; regime_tributario: string | null;
  status: string; email: string | null; telefone: string | null;
};
export type ClasseReconc = "novo" | "atualizado" | "inalterado" | "pendencia";
export type ItemReconc = { classe: ClasseReconc; cliente: ClienteNormalizado; diff: Record<string, [unknown, unknown]> };

const CAMPOS: (keyof ClienteExistente)[] = ["razao_social", "regime_tributario", "status", "email", "telefone"];

export function reconciliarClientes(novos: ClienteNormalizado[], existentes: ClienteExistente[]): ItemReconc[] {
  const idx = new Map<string, ClienteExistente>();
  for (const e of existentes) idx.set(e.cpf_cnpj, e);

  return novos.map((cliente) => {
    if (cliente.pendencias.length > 0) return { classe: "pendencia" as const, cliente, diff: {} };
    const atual = idx.get(cliente.cpf_cnpj);
    if (!atual) return { classe: "novo" as const, cliente, diff: {} };
    const diff: Record<string, [unknown, unknown]> = {};
    for (const campo of CAMPOS) {
      const antigo = atual[campo] ?? null;
      const novo = (cliente as unknown as Record<string, unknown>)[campo] ?? null;
      if (String(antigo) !== String(novo)) diff[campo] = [antigo, novo];
    }
    return { classe: Object.keys(diff).length ? ("atualizado" as const) : ("inalterado" as const), cliente, diff };
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/dominio/reconciliar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib/dominio/reconciliar.ts src/tests/dominio/reconciliar.test.ts
git commit -m "feat(dominio): reconciliação por CNPJ (novo/atualizado/inalterado/pendência)"
```

---

## Task 8: Migration 0012 — colunas de origem em `clientes`

**Files:**
- Create: `supabase/migrations/0012_clientes_origem_dominio.sql`

**Interfaces:**
- Produces: colunas `clientes.origem`, `clientes.dominio_codigo`, `clientes.cnae`, `clientes.sincronizado_em`, `clientes.dominio_snapshot`.

- [ ] **Step 1: Escrever a migration (idempotente)**

```sql
-- supabase/migrations/0012_clientes_origem_dominio.sql
-- Rastreio de origem/sincronização com o Domínio (V2). Idempotente.
alter table clientes add column if not exists origem text not null default 'manual';
alter table clientes add column if not exists dominio_codigo text;
alter table clientes add column if not exists cnae text;
alter table clientes add column if not exists sincronizado_em timestamptz;
alter table clientes add column if not exists dominio_snapshot jsonb;

create unique index if not exists clientes_dominio_codigo_uidx
  on clientes (dominio_codigo) where dominio_codigo is not null;
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: saída indica `0012_clientes_origem_dominio.sql` aplicada (registrada em `app_migrations`).

- [ ] **Step 3: Conferir que reaplicar é no-op**

Run: `npm run db:migrate`
Expected: nenhuma migration nova aplicada (0012 já consta).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_clientes_origem_dominio.sql
git commit -m "feat(db): colunas de origem/sync do Domínio em clientes (0012)"
```

---

## Task 9: Migration 0013 — `contratos_dominio` + RLS + asserts

**Files:**
- Create: `supabase/migrations/0013_contratos_dominio.sql`
- Modify: `supabase/tests/rls.test.sql` (asserts novos)

**Interfaces:**
- Produces: tabela `contratos_dominio` (RLS espelhando `clientes_financeiro`).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0013_contratos_dominio.sql
-- Contratos/honorários vindos do Domínio. Têm valores => RLS = clientes_financeiro
-- (assistente NÃO acessa). Idempotente.
create table if not exists contratos_dominio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  dominio_codigo text,
  tipo_contrato text,
  emissao date,
  inicio_contrato date,
  inicio_faturamento date,
  dia_vencimento text,
  encerrado_em date,
  valor_original numeric(12, 2),
  valor_atual numeric(12, 2),
  criado_em timestamptz not null default now()
);

alter table contratos_dominio enable row level security;

-- Assistente NÃO tem policy => não lê nem grava (igual a clientes_financeiro).
drop policy if exists contratos_select on contratos_dominio;
create policy contratos_select on contratos_dominio for select to authenticated using (
  auth_papel() in ('admin', 'financeiro')
  or (auth_papel() = 'contador'
      and exists (select 1 from clientes c where c.id = cliente_id and c.contador_id = auth.uid()))
);
drop policy if exists contratos_insert on contratos_dominio;
create policy contratos_insert on contratos_dominio for insert to authenticated with check (
  auth_papel() in ('admin', 'financeiro')
);
drop policy if exists contratos_update on contratos_dominio;
create policy contratos_update on contratos_dominio for update to authenticated using (
  auth_papel() in ('admin', 'financeiro')
) with check (auth_papel() in ('admin', 'financeiro'));
drop policy if exists contratos_delete on contratos_dominio;
create policy contratos_delete on contratos_dominio for delete to authenticated using (
  auth_papel() = 'admin'
);
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: `0013_contratos_dominio.sql` aplicada.

- [ ] **Step 3: Adicionar asserts de RLS** (acrescentar ao final de `supabase/tests/rls.test.sql`, antes de qualquer bloco final)

```sql
-- ===== V2: contratos_dominio seguem a RLS do financeiro =====
-- seed: um contrato para o cliente do contador
reset role;
insert into contratos_dominio (id, cliente_id, tipo_contrato, valor_atual) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'HONORARIOS CONTABEIS', 250.00)
  on conflict do nothing;

-- ASSERT: assistente NÃO enxerga contratos_dominio (sem policy)
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000002'); -- assistente
  select count(*) into n from contratos_dominio;
  if n <> 0 then raise exception 'FALHA: assistente viu % contratos_dominio (devia ser 0)', n; end if;
  raise notice 'OK: assistente não acessa contratos_dominio';
end $$;

-- ASSERT: financeiro enxerga contratos_dominio
do $$
declare n int;
begin
  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  select count(*) into n from contratos_dominio;
  if n < 1 then raise exception 'FALHA: financeiro não viu contratos_dominio'; end if;
  raise notice 'OK: financeiro acessa contratos_dominio';
end $$;
```

- [ ] **Step 4: Rodar os testes de RLS**

Run: `npm run db:test`
Expected: termina com `✓ TODOS OS ASSERTS PASSARAM` incluindo os dois `OK:` novos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_contratos_dominio.sql supabase/tests/rls.test.sql
git commit -m "feat(db): contratos_dominio com RLS do financeiro + asserts (0013)"
```

---

## Task 10: Migration 0014 — `importacoes` e `importacao_itens`

**Files:**
- Create: `supabase/migrations/0014_importacoes.sql`

**Interfaces:**
- Produces: tabelas `importacoes` (auditoria) e `importacao_itens` (staging da prévia, com expiração).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0014_importacoes.sql
-- Auditoria das importações do Domínio + staging da prévia. Idempotente.
create table if not exists importacoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'previa', -- previa | aplicada | falha
  arquivos jsonb,                        -- nomes dos arquivos enviados
  executado_por uuid references usuarios(id),
  executado_em timestamptz not null default now(),
  novos int not null default 0,
  atualizados int not null default 0,
  inalterados int not null default 0,
  pendencias int not null default 0,
  erros int not null default 0,
  expira_em timestamptz                   -- prévias expiram; aplicadas têm null
);

create table if not exists importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references importacoes(id) on delete cascade,
  classe text not null,                   -- novo|atualizado|inalterado|pendencia|erro
  cpf_cnpj text,
  payload jsonb not null                  -- ClienteNormalizado + diff + contratos
);

alter table importacoes enable row level security;
alter table importacao_itens enable row level security;

-- Cadastral: admin/assistente gerenciam importação.
drop policy if exists imp_all on importacoes;
create policy imp_all on importacoes for all to authenticated
  using (auth_papel() in ('admin', 'assistente'))
  with check (auth_papel() in ('admin', 'assistente'));

drop policy if exists imp_itens_all on importacao_itens;
create policy imp_itens_all on importacao_itens for all to authenticated
  using (auth_papel() in ('admin', 'assistente'))
  with check (auth_papel() in ('admin', 'assistente'));

-- Limpeza de prévias expiradas (chamada pela action antes de criar nova prévia).
create or replace function limpar_previas_expiradas() returns void language sql security definer set search_path = public as $$
  delete from importacoes where status = 'previa' and expira_em is not null and expira_em < now();
$$;
revoke all on function limpar_previas_expiradas() from public;
grant execute on function limpar_previas_expiradas() to authenticated;
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: `0014_importacoes.sql` aplicada.

- [ ] **Step 3: Reaplicar é no-op**

Run: `npm run db:migrate`
Expected: nenhuma migration nova.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_importacoes.sql
git commit -m "feat(db): importacoes + importacao_itens (staging/auditoria) (0014)"
```

---

## Task 11: Server actions (upload→prévia, aplicar)

**Files:**
- Create: `src/app/(app)/integracoes/dominio/estados.ts`, `src/app/(app)/integracoes/dominio/actions.ts`

**Interfaces:**
- Consumes: `lerXls`, `detectarTipo`, `parseEmpresas`, `parseContratos`, `parseClientes`, `combinarFontes`, `reconciliarClientes`, `parseContratos` types; `createServerSupabase` (`@/lib/supabase/server`).
- Produces: `export async function gerarPrevia(prev, formData): Promise<EstadoPrevia>`; `export async function aplicarImportacao(importacaoId: string): Promise<EstadoAplicar>`.

- [ ] **Step 1: Definir `estados.ts`**

```ts
// src/app/(app)/integracoes/dominio/estados.ts
export type ResumoPrevia = {
  importacaoId: string;
  novos: number; atualizados: number; inalterados: number; pendencias: number; erros: number;
};
export type EstadoPrevia = { erro?: string; resumo?: ResumoPrevia };
export type EstadoAplicar = { erro?: string; ok?: boolean; gravados?: number };
```

- [ ] **Step 2: Implementar `actions.ts`** (sem teste unitário automatizado — coberto pela verificação E2E da Task 14; lógica pura já testada nas Tasks 1–7)

```ts
// src/app/(app)/integracoes/dominio/actions.ts
"use server";
import { createServerSupabase } from "@/lib/supabase/server";
import { lerXls } from "@/lib/dominio/biff";
import { detectarTipo } from "@/lib/dominio/detectar";
import { parseEmpresas } from "@/lib/dominio/parseEmpresas";
import { parseContratos } from "@/lib/dominio/parseContratos";
import { parseClientes } from "@/lib/dominio/parseClientes";
import { combinarFontes } from "@/lib/dominio/mapear";
import { reconciliarClientes, type ClienteExistente } from "@/lib/dominio/reconciliar";
import type { EmpresaDominio, ContatoDominio, ContratoDominio } from "@/lib/dominio/tipos";
import type { EstadoPrevia, EstadoAplicar } from "./estados";

const MEIA_HORA = 30 * 60 * 1000;

export async function gerarPrevia(_prev: EstadoPrevia, formData: FormData): Promise<EstadoPrevia> {
  const arquivos = formData.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) return { erro: "Selecione ao menos um arquivo .xls exportado do Domínio." };

  let empresas: EmpresaDominio[] = [];
  let contatos: ContatoDominio[] = [];
  let contratos: ContratoDominio[] = [];
  const nomes: string[] = [];
  for (const f of arquivos) {
    nomes.push(f.name);
    let folha;
    try { folha = lerXls(Buffer.from(await f.arrayBuffer()))[0]; }
    catch { return { erro: `Arquivo "${f.name}" não é um .xls válido do Domínio.` }; }
    const tipo = detectarTipo(folha);
    if (tipo === "empresas") empresas = parseEmpresas(folha);
    else if (tipo === "clientes") contatos = parseClientes(folha);
    else if (tipo === "contratos") contratos = parseContratos(folha);
    else return { erro: `Não reconheci o arquivo "${f.name}" (esperado Empresas, Clientes ou Contratos).` };
  }
  if (empresas.length === 0) return { erro: "É obrigatório enviar o arquivo de Empresas (cadastro-mestre)." };

  const normalizados = combinarFontes(empresas, contatos);

  const supabase = await createServerSupabase();
  await supabase.rpc("limpar_previas_expiradas");
  const { data: existentesRaw } = await supabase
    .from("clientes")
    .select("cpf_cnpj, razao_social, regime_tributario, status, email, telefone");
  const existentes = (existentesRaw ?? []) as ClienteExistente[];

  const itens = reconciliarClientes(normalizados, existentes);
  const contratosPorCodigo = new Map<string, ContratoDominio[]>();
  for (const c of contratos) {
    const k = String(c.codigoCliente);
    if (!contratosPorCodigo.has(k)) contratosPorCodigo.set(k, []);
    contratosPorCodigo.get(k)!.push(c);
  }

  const resumo = { novos: 0, atualizados: 0, inalterados: 0, pendencias: 0, erros: 0 };
  for (const it of itens) {
    if (it.classe === "novo") resumo.novos++;
    else if (it.classe === "atualizado") resumo.atualizados++;
    else if (it.classe === "inalterado") resumo.inalterados++;
    else if (it.classe === "pendencia") resumo.pendencias++;
  }

  const { data: imp, error: impErr } = await supabase
    .from("importacoes")
    .insert({ status: "previa", arquivos: nomes, expira_em: new Date(Date.now() + MEIA_HORA).toISOString(), ...resumo })
    .select("id")
    .single();
  if (impErr || !imp) return { erro: "Sem permissão para importar (admin/assistente)." };

  const itensRows = itens.map((it) => ({
    importacao_id: imp.id,
    classe: it.classe,
    cpf_cnpj: it.cliente.cpf_cnpj,
    payload: { cliente: it.cliente, diff: it.diff, contratos: it.cliente.dominio_codigo ? (contratosPorCodigo.get(it.cliente.dominio_codigo) ?? []) : [] },
  }));
  const { error: itErr } = await supabase.from("importacao_itens").insert(itensRows);
  if (itErr) return { erro: "Falha ao montar a prévia." };

  return { resumo: { importacaoId: imp.id, ...resumo } };
}

export async function aplicarImportacao(importacaoId: string): Promise<EstadoAplicar> {
  const supabase = await createServerSupabase();
  const { data: itens, error } = await supabase
    .from("importacao_itens").select("classe, cpf_cnpj, payload").eq("importacao_id", importacaoId);
  if (error || !itens) return { erro: "Prévia expirada ou inacessível. Gere novamente." };

  let gravados = 0;
  for (const it of itens) {
    if (it.classe !== "novo" && it.classe !== "atualizado") continue;
    const cliente = (it.payload as { cliente: Record<string, unknown> }).cliente;
    const contratos = (it.payload as { contratos: ContratoDominio[] }).contratos ?? [];
    const upsertCliente = {
      cpf_cnpj: cliente.cpf_cnpj, tipo_pessoa: cliente.tipo_pessoa, razao_social: cliente.razao_social,
      nome_fantasia: cliente.nome_fantasia, regime_tributario: cliente.regime_tributario, status: cliente.status,
      cnae: cliente.cnae, inscricao_estadual: cliente.inscricao_estadual, endereco: cliente.endereco,
      email: cliente.email, telefone: cliente.telefone, dominio_codigo: cliente.dominio_codigo,
      origem: "dominio", sincronizado_em: new Date().toISOString(), dominio_snapshot: cliente,
    };
    const { data: cli, error: cliErr } = await supabase
      .from("clientes").upsert(upsertCliente, { onConflict: "cpf_cnpj" }).select("id").single();
    if (cliErr || !cli) return { erro: `Falha ao gravar cliente ${cliente.cpf_cnpj} (sem permissão?).` };
    gravados++;

    // honorário = soma dos contratos ativos "HONORARIOS CONTABEIS"
    const honorario = contratos
      .filter((c) => !c.encerradoEm && /honor/i.test(c.tipoContrato))
      .reduce((s, c) => s + (c.valorAtual ?? 0), 0);
    if (honorario > 0) {
      await supabase.from("clientes_financeiro").upsert(
        { cliente_id: cli.id, honorario_mensal: honorario }, { onConflict: "cliente_id" });
      await supabase.from("contratos_dominio").delete().eq("cliente_id", cli.id);
      if (contratos.length) {
        await supabase.from("contratos_dominio").insert(contratos.map((c) => ({
          cliente_id: cli.id, dominio_codigo: String(c.codigoCliente), tipo_contrato: c.tipoContrato,
          emissao: c.emissao, inicio_contrato: c.inicioContrato, inicio_faturamento: c.inicioFaturamento,
          dia_vencimento: c.diaVencimento, encerrado_em: c.encerradoEm,
          valor_original: c.valorOriginal, valor_atual: c.valorAtual,
        })));
      }
    }
  }

  await supabase.from("importacoes").update({ status: "aplicada", expira_em: null }).eq("id", importacaoId);
  return { ok: true, gravados };
}
```

> Nota: o `upsert` de honorário/contratos só é tentado quando há honorário > 0; se o papel for `assistente`, a RLS bloqueia `contratos_dominio`/`clientes_financeiro` silenciosamente — por isso a UI (Task 13) só oferece o arquivo de Contratos para admin/financeiro.

- [ ] **Step 3: Verificar lint/types/test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tudo verde (sem novos testes; garante que as actions compilam e nada quebrou).

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/integracoes/dominio/estados.ts src/app/(app)/integracoes/dominio/actions.ts
git commit -m "feat(dominio): actions de prévia e aplicação da importação"
```

---

## Task 12: UI — página, upload e prévia

**Files:**
- Create: `src/app/(app)/integracoes/dominio/page.tsx`, `src/components/dominio/UploadDominio.tsx`, `src/components/dominio/PreviaImportacao.tsx`

**Interfaces:**
- Consumes: `gerarPrevia`, `aplicarImportacao` (Task 11); padrão de UI dos componentes existentes (`useActionState`, Tailwind).

- [ ] **Step 1: Componente de upload (`UploadDominio.tsx`)**

```tsx
// src/components/dominio/UploadDominio.tsx
"use client";
import { useActionState } from "react";
import { gerarPrevia } from "@/app/(app)/integracoes/dominio/actions";
import type { EstadoPrevia } from "@/app/(app)/integracoes/dominio/estados";
import { PreviaImportacao } from "./PreviaImportacao";

export function UploadDominio() {
  const [estado, action, pendente] = useActionState<EstadoPrevia, FormData>(gerarPrevia, {});
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3 rounded-lg border border-gray-200 p-4">
        <label htmlFor="arquivos" className="block text-sm font-medium">
          Arquivos exportados do Domínio (Empresas, Clientes, Contratos)
        </label>
        <input id="arquivos" name="arquivos" type="file" accept=".xls" multiple required
          className="block w-full text-sm" />
        <button type="submit" disabled={pendente}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pendente ? "Lendo arquivos…" : "Gerar prévia"}
        </button>
        {estado.erro && <p role="alert" className="text-sm text-red-600">{estado.erro}</p>}
      </form>
      {estado.resumo && <PreviaImportacao resumo={estado.resumo} />}
    </div>
  );
}
```

- [ ] **Step 2: Componente de prévia/confirmação (`PreviaImportacao.tsx`)**

```tsx
// src/components/dominio/PreviaImportacao.tsx
"use client";
import { useState, useTransition } from "react";
import { aplicarImportacao } from "@/app/(app)/integracoes/dominio/actions";
import type { ResumoPrevia } from "@/app/(app)/integracoes/dominio/estados";

export function PreviaImportacao({ resumo }: { resumo: ResumoPrevia }) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const aplicar = () => start(async () => {
    const r = await aplicarImportacao(resumo.importacaoId);
    if (r.erro) setMsg(r.erro);
    else { setFeito(true); setMsg(`Importação aplicada: ${r.gravados} cliente(s) gravado(s).`); }
  });
  const Card = ({ rotulo, n, cor }: { rotulo: string; n: number; cor: string }) => (
    <div className={`rounded-md border p-3 text-center ${cor}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs">{rotulo}</div>
    </div>
  );
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold">Prévia da importação</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Card rotulo="Novos" n={resumo.novos} cor="border-green-200 bg-green-50" />
        <Card rotulo="Atualizados" n={resumo.atualizados} cor="border-yellow-200 bg-yellow-50" />
        <Card rotulo="Inalterados" n={resumo.inalterados} cor="border-gray-200 bg-gray-50" />
        <Card rotulo="Pendências" n={resumo.pendencias} cor="border-purple-200 bg-purple-50" />
        <Card rotulo="Erros" n={resumo.erros} cor="border-red-200 bg-red-50" />
      </div>
      {!feito && (
        <button onClick={aplicar} disabled={pend}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pend ? "Aplicando…" : `Aplicar (${resumo.novos + resumo.atualizados} registros)`}
        </button>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Página (`page.tsx`) com gate de papel**

```tsx
// src/app/(app)/integracoes/dominio/page.tsx
import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/auth/perfil";
import { UploadDominio } from "@/components/dominio/UploadDominio";

export default async function IntegracaoDominioPage() {
  const perfil = await getPerfil();
  if (!perfil || !["admin", "assistente", "financeiro"].includes(perfil.papel)) redirect("/");
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Integração Domínio</h1>
        <p className="text-sm text-gray-600">
          Importe cadastro, regime e honorários a partir dos relatórios exportados do Domínio.
        </p>
      </header>
      <UploadDominio />
    </main>
  );
}
```

> Verificar a assinatura real de `getPerfil` em `src/lib/auth/perfil.ts` e ajustar o acesso a `perfil.papel` conforme o tipo retornado.

- [ ] **Step 4: Verificar build/lint/types**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: build conclui sem erro; rota `/integracoes/dominio` presente na saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/integracoes/dominio/page.tsx src/components/dominio/UploadDominio.tsx src/components/dominio/PreviaImportacao.tsx
git commit -m "feat(dominio): UI de upload + prévia/confirmação da importação"
```

---

## Task 13: Link no menu + restrição por papel

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Ler o Sidebar e o padrão de itens**

Run: `sed -n '1,80p' src/components/Sidebar.tsx`
Expected: identificar como os itens de menu são definidos e como o papel é recebido/filtrado.

- [ ] **Step 2: Adicionar item "Integração Domínio"** visível a admin/assistente/financeiro, seguindo o padrão existente (rota `/integracoes/dominio`). Inserir no array de itens com o mesmo formato dos demais (label + href + papéis permitidos).

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: verde; link aparece para os papéis corretos.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(dominio): item de menu Integração Domínio (admin/assistente/financeiro)"
```

---

## Task 14: Verificação E2E manual com os arquivos reais

**Files:** nenhuma (verificação; sem commit de dados reais).

- [ ] **Step 1: Subir o app**

Run: `npm run dev`
Expected: servidor em `http://localhost:3000`.

- [ ] **Step 2: Logar como admin** e abrir `/integracoes/dominio`.

- [ ] **Step 3: Enviar os três arquivos** de `~/dominio-export/` (Empresas, Clientes, Contratos) e clicar **Gerar prévia**.
Expected: resumo coerente (~123 novos na primeira carga; pendências para imune/isenta ≈ 4).

- [ ] **Step 4: Clicar Aplicar.**
Expected: "Importação aplicada: N cliente(s) gravado(s)."

- [ ] **Step 5: Conferir no banco** (psql/Studio):
```sql
select count(*) from clientes where origem = 'dominio';
select regime_tributario, count(*) from clientes group by 1 order by 2 desc;
select count(*) from contratos_dominio;
select cliente_id, honorario_mensal from clientes_financeiro limit 5;
```
Expected: ~123 clientes; regimes Simples/Presumido/Real distribuídos; contratos > 0; honorários espelhados.

- [ ] **Step 6: Reimportar os mesmos arquivos** (idempotência).
Expected: prévia mostra 0 novos / ~0 atualizados (todos inalterados).

- [ ] **Step 7: Rodar a suíte completa**

Run: `npm run lint && npm run typecheck && npm test && npm run db:test`
Expected: tudo verde.

- [ ] **Step 8: Atualizar o CHANGELOG e abrir PR**

Mover a entrada de `[Não lançado]` do `CHANGELOG.md` com o resumo da V2; abrir PR `develop → main` quando a V2 for fechada (release `v2.0.0` conforme `docs/VERSIONAMENTO.md`).

---

## Self-Review (resultado)

- **Cobertura do spec:** §3–§5 (parsers + mapeamento) → Tasks 1–6; §4 identidade/CNPJ → Task 6/7; §6 arquitetura/fonte abstrata → camada `src/lib/dominio` + actions; §7 migrations → Tasks 8–10; §8 fluxo/UI → Tasks 11–13; §9 erros/pendências → Tasks 6/7/11; §10 LGPD (descarte do arquivo, prévia com expiração) → Task 11 + 0014; §11 papéis/RLS → Tasks 9/12/13; §12 testes → Tasks 1–7 + 9 + 14.
- **Placeholders:** nenhum passo com "TBD/igual à Task N"; código presente em todos os passos de código. Pontos que dependem do código existente (`getPerfil`, padrão do `Sidebar`) têm passo explícito de leitura/ajuste.
- **Consistência de tipos:** `FolhaXls`/`CelulaXls` (T1) usados em T2–T5; `ClienteNormalizado` (T6) consumido em T7/T11; `ClienteExistente` (T7) alimentado pelo `select` em T11; `honorario_mensal` (coluna real) usado em T11/T14.
- **Decisões em aberto (do spec §14):** confirmar export CSV/TXT — não bloqueia (parser `.xls` validado); "Microempresa→Simples" embutido em `mapearRegime`; "Ativa - Sem movimento"→ativo em `mapearStatus`; clientes-PF sem empresa entram como `pendencia` (não há empresa-base → não geram `ClienteNormalizado`; aparecerão só se um cadastro de PF for adicionado como fonte futura).
