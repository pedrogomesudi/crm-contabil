# Conciliação bancária — Fatia A (Importação + movimentações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar o extrato bancário (OFX/CSV) de uma conta, deduplicando, e ver as movimentações persistidas por conta/período.

**Architecture:** Tabela `movimento_bancario` (dedup por FITID/hash) + parsers puros OFX/CSV (TDD, rodam no cliente e no servidor, sem `node:crypto`) + actions de import/lista + página `/financeiro/conciliacao` (upload → mapeamento CSV → prévia → importar → lista). Spec: `docs/superpowers/specs/2026-07-09-conciliacao-bancaria-fatiaA-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`.
- Gate: `podeGerenciarFinanceiro` (admin/financeiro). RLS por papel.
- Parsers **puros e isomórficos** (sem `node:crypto` — o cliente também computa `dedupHash`).
- Valor **com sinal** (+ crédito / − débito). CSV: valor em coluna única; vírgula = decimal quando houver.
- Migration idempotente; imutável após aplicada (`npm run db:migrate` atinge produção).
- Branch: `git checkout -b feat/conciliacao-fatiaA develop`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Deploy (pós-merge):** `develop → main → Implantar`; confirmar por `curl` da rota nova (307) e/ou histórico verde do EasyPanel.

---

## File Structure

- `supabase/migrations/0064_movimento_bancario.sql` — **novo**: tabela + RLS.
- `src/lib/conciliacao/parse.ts` (+ test) — **novo**: parsers OFX/CSV + `dedupHash`.
- `src/app/(app)/financeiro/conciliacao/actions.ts` — **novo**: import/lista/dedup/contas.
- `src/app/(app)/financeiro/conciliacao/Conciliacao.tsx` + `page.tsx` (+ smoke) — **novo**: UI.
- `src/app/(app)/financeiro/dashboard/page.tsx` — **modificar**: link "Conciliação".

---

## Task 1: Migration — movimento_bancario

**Files:**
- Create: `supabase/migrations/0064_movimento_bancario.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Conciliação bancária Fatia A: movimentações importadas do extrato (OFX/CSV), com dedup.
create table if not exists movimento_bancario (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references conta_bancaria(id) on delete cascade,
  data date not null,
  valor numeric(15,2) not null,
  descricao text,
  fitid text,
  dedup_hash text not null,
  status text not null default 'pendente',
  baixa_id uuid references baixa(id) on delete set null,
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

- [ ] **Step 2: Aplicar** — `npm run db:migrate` (esperado: `0064_movimento_bancario` aplicada). ⚠️ Produção; imutável depois.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/0064_movimento_bancario.sql
git commit -m "feat(conciliacao): migration movimento_bancario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Parsers OFX/CSV + dedupHash (TDD)

**Files:**
- Create: `src/lib/conciliacao/parse.ts`
- Test: `src/tests/conciliacao/parse.test.ts`

**Interfaces:**
- Produces: `type MovimentoBruto`, `parsearOFX`, `cabecalhosCSV`, `type MapaCSV`, `parsearCSV`, `dedupHash`.

- [ ] **Step 1: Testes**

```ts
import { describe, it, expect } from "vitest";
import { parsearOFX, cabecalhosCSV, parsearCSV, dedupHash } from "@/lib/conciliacao/parse";

const OFX_V2 = `<OFX><BANKMSGSRSV1><STMTTRNRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260701120000[-03:EST]</DTPOSTED><TRNAMT>1500.00</TRNAMT><FITID>ABC1</FITID><MEMO>PIX RECEBIDO ACME</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260702</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>ABC2</FITID><NAME>TARIFA</NAME></STMTTRN>
</BANKTRANLIST></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_V1 = `OFXHEADER:100
<OFX><STMTTRN><DTPOSTED>20260703
<TRNAMT>200.50
<FITID>X9
<MEMO>DEPOSITO
</STMTTRN></OFX>`;

describe("parsearOFX", () => {
  it("lê v2 (XML) com sinal, fitid, memo/name", () => {
    const r = parsearOFX(OFX_V2);
    expect(r).toEqual([
      { data: "2026-07-01", valor: 1500, descricao: "PIX RECEBIDO ACME", fitid: "ABC1" },
      { data: "2026-07-02", valor: -89.9, descricao: "TARIFA", fitid: "ABC2" },
    ]);
  });
  it("lê v1 (SGML, tags sem fechamento)", () => {
    const r = parsearOFX(OFX_V1);
    expect(r).toEqual([{ data: "2026-07-03", valor: 200.5, descricao: "DEPOSITO", fitid: "X9" }]);
  });
});

const CSV = `Data;Histórico;Valor
01/07/2026;PIX RECEBIDO;1.500,00
02/07/2026;TARIFA;-89,90
03/07/2026;COMPRA;(50,00)`;

describe("cabecalhosCSV / parsearCSV", () => {
  it("detecta delimitador e cabeçalhos", () => {
    expect(cabecalhosCSV(CSV)).toEqual(["Data", "Histórico", "Valor"]);
  });
  it("parseia data BR e valor com vírgula/negativo/parênteses", () => {
    const r = parsearCSV(CSV, { data: "Data", valor: "Valor", descricao: "Histórico" });
    expect(r).toEqual([
      { data: "2026-07-01", valor: 1500, descricao: "PIX RECEBIDO", fitid: null },
      { data: "2026-07-02", valor: -89.9, descricao: "TARIFA", fitid: null },
      { data: "2026-07-03", valor: -50, descricao: "COMPRA", fitid: null },
    ]);
  });
});

describe("dedupHash", () => {
  it("usa fitid quando existe", () => {
    expect(dedupHash({ data: "2026-07-01", valor: 10, descricao: "x", fitid: "F1" })).toBe("F1");
  });
  it("sem fitid: estável e sensível a data/valor/descrição", () => {
    const a = dedupHash({ data: "2026-07-01", valor: 10, descricao: "PIX ACME", fitid: null });
    const b = dedupHash({ data: "2026-07-01", valor: 10, descricao: "pix acme", fitid: null });
    const c = dedupHash({ data: "2026-07-01", valor: 11, descricao: "PIX ACME", fitid: null });
    expect(a).toBe(b); // case-insensitive
    expect(a).not.toBe(c);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- conciliacao/parse` → FAIL.

- [ ] **Step 3: Implementar `parse.ts`**

```ts
export type MovimentoBruto = { data: string; valor: number; descricao: string; fitid: string | null };
export type MapaCSV = { data: string; valor: string; descricao: string };

const tagOFX = (bloco: string, nome: string): string | null => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : null;
};

export function parsearOFX(texto: string): MovimentoBruto[] {
  const out: MovimentoBruto[] = [];
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const b = m[1]!;
    const dt = tagOFX(b, "DTPOSTED");
    const amt = tagOFX(b, "TRNAMT");
    if (!dt || dt.length < 8 || !amt) continue;
    const valor = Number(amt.replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    out.push({
      data: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
      valor,
      descricao: (tagOFX(b, "MEMO") ?? tagOFX(b, "NAME") ?? "").trim(),
      fitid: tagOFX(b, "FITID"),
    });
  }
  return out;
}

function delimitador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? "";
  return primeira.split(";").length > primeira.split(",").length ? ";" : ",";
}
const limpar = (s: string) => s.trim().replace(/^"|"$/g, "");

export function cabecalhosCSV(texto: string): string[] {
  const d = delimitador(texto);
  return (texto.split(/\r?\n/)[0] ?? "").split(d).map(limpar);
}

function dataBRparaISO(s: string): string | null {
  const br = s.trim().match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function valorBR(s: string): number | null {
  let t = s.trim().replace(/[R$\s]/gi, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith("-")) { neg = true; t = t.slice(1); }
  if (t.startsWith("+")) t = t.slice(1);
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = Number(t);
  if (!Number.isFinite(v) || t === "") return null;
  return neg ? -v : v;
}

export function parsearCSV(texto: string, mapa: MapaCSV): MovimentoBruto[] {
  const d = delimitador(texto);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const cab = linhas[0]!.split(d).map(limpar);
  const iData = cab.indexOf(mapa.data);
  const iValor = cab.indexOf(mapa.valor);
  const iDesc = cab.indexOf(mapa.descricao);
  if (iData < 0 || iValor < 0) return [];
  const out: MovimentoBruto[] = [];
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(d).map(limpar);
    const data = dataBRparaISO(cols[iData] ?? "");
    const valor = valorBR(cols[iValor] ?? "");
    if (!data || valor === null) continue;
    out.push({ data, valor, descricao: iDesc >= 0 ? (cols[iDesc] ?? "").trim() : "", fitid: null });
  }
  return out;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function dedupHash(m: MovimentoBruto): string {
  if (m.fitid) return m.fitid;
  return "h" + fnv1a(`${m.data}|${m.valor.toFixed(2)}|${m.descricao.trim().toLowerCase()}`);
}
```

- [ ] **Step 4: Rodar + verificar** — `npm test -- conciliacao/parse` (PASS), `npm run lint`, `npm run typecheck`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/conciliacao/parse.ts src/tests/conciliacao/parse.test.ts
git commit -m "feat(conciliacao): parsers OFX/CSV + dedupHash (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions de importação e listagem

**Files:**
- Create: `src/app/(app)/financeiro/conciliacao/actions.ts`

**Interfaces:**
- Consumes: `MovimentoBruto`, `dedupHash` (Task 2); `podeGerenciarFinanceiro`.
- Produces: `type MovimentoView`, `importarMovimentos`, `jaImportados`, `listarMovimentos`, `listarContas`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { dedupHash, type MovimentoBruto } from "@/lib/conciliacao/parse";

export type MovimentoView = { id: string; data: string; descricao: string; valor: number; status: string };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function listarContas(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}

export async function jaImportados(contaId: string, hashes: string[]): Promise<string[]> {
  if (!(await gate()) || hashes.length === 0) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("movimento_bancario").select("dedup_hash").eq("conta_bancaria_id", contaId).in("dedup_hash", hashes);
  return (data ?? []).map((r) => r.dedup_hash as string);
}

export async function importarMovimentos(contaId: string, movimentos: MovimentoBruto[]): Promise<{ inseridos: number; ignorados: number } | { erro: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!contaId) return { erro: "Selecione a conta." };
  const supabase = await createServerSupabase();
  const comHash = movimentos.map((m) => ({ m, hash: dedupHash(m) }));
  const hashes = [...new Set(comHash.map((x) => x.hash))];
  const existentes = new Set(await jaImportados(contaId, hashes));
  const vistos = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const { m, hash } of comHash) {
    if (existentes.has(hash) || vistos.has(hash)) continue;
    vistos.add(hash);
    rows.push({ conta_bancaria_id: contaId, data: m.data, valor: m.valor, descricao: m.descricao || null, fitid: m.fitid, dedup_hash: hash, importado_por: perfil.id });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("movimento_bancario").insert(rows);
    if (error) return { erro: error.message };
  }
  return { inseridos: rows.length, ignorados: movimentos.length - rows.length };
}

export async function listarMovimentos(contaId: string, inicio: string, fim: string, status: string): Promise<MovimentoView[]> {
  if (!(await gate()) || !contaId) return [];
  const supabase = await createServerSupabase();
  let q = supabase.from("movimento_bancario").select("id, data, descricao, valor, status").eq("conta_bancaria_id", contaId).gte("data", inicio).lte("data", fim).order("data");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((r) => ({ id: r.id as string, data: r.data as string, descricao: (r.descricao as string | null) ?? "", valor: Number(r.valor), status: r.status as string }));
}
```

- [ ] **Step 2: Verificar + commit** — `npm run lint && npm run typecheck && npm run build`.
```bash
git add "src/app/(app)/financeiro/conciliacao/actions.ts"
git commit -m "feat(conciliacao): actions de import/lista/dedup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: UI — upload, mapeamento, prévia, lista

**Files:**
- Create: `src/app/(app)/financeiro/conciliacao/Conciliacao.tsx`
- Create: `src/app/(app)/financeiro/conciliacao/page.tsx`
- Modify: `src/app/(app)/financeiro/dashboard/page.tsx`
- Test: `src/tests/conciliacao/conciliacao-render.test.tsx`

**Interfaces:**
- Consumes: parsers (Task 2); `importarMovimentos`, `jaImportados`, `listarMovimentos`, `MovimentoView` (Task 3).

- [ ] **Step 1: Smoke**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/conciliacao/actions", () => ({ importarMovimentos: vi.fn(), jaImportados: vi.fn(), listarMovimentos: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { Conciliacao } from "@/app/(app)/financeiro/conciliacao/Conciliacao";
import type { MovimentoView } from "@/app/(app)/financeiro/conciliacao/actions";

const movs: MovimentoView[] = [{ id: "1", data: "2026-07-01", descricao: "PIX RECEBIDO", valor: 1500, status: "pendente" }];

describe("Conciliacao", () => {
  it("renderiza seletor de conta, upload e a lista", () => {
    const html = renderToStaticMarkup(<Conciliacao contas={[{ id: "c1", nome: "Nubank" }]} inicio="2026-07-01" fim="2026-07-31" contaInicial="c1" movimentosIni={movs} />);
    expect(html).toContain("Nubank");
    expect(html).toContain("PIX RECEBIDO");
    expect(html).toContain("Importar extrato");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- conciliacao/conciliacao-render` → FAIL.

- [ ] **Step 3: `Conciliacao.tsx`**

```tsx
"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { parsearOFX, cabecalhosCSV, parsearCSV, dedupHash, type MovimentoBruto, type MapaCSV } from "@/lib/conciliacao/parse";
import { importarMovimentos, jaImportados, listarMovimentos, type MovimentoView } from "./actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const acharCol = (cols: string[], termos: string[]) => cols.find((c) => termos.some((t) => c.toLowerCase().includes(t))) ?? "";

export function Conciliacao({ contas, inicio: iniIni, fim: fimIni, contaInicial, movimentosIni }: { contas: { id: string; nome: string }[]; inicio: string; fim: string; contaInicial: string; movimentosIni: MovimentoView[] }) {
  const [conta, setConta] = useState(contaInicial);
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [status, setStatus] = useState("");
  const [lista, setLista] = useState<MovimentoView[]>(movimentosIni);
  const [textoCSV, setTextoCSV] = useState<string | null>(null);
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [mapa, setMapa] = useState<MapaCSV>({ data: "", valor: "", descricao: "" });
  const [previa, setPrevia] = useState<{ mov: MovimentoBruto; novo: boolean }[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function recarregar(c: string, i: string, f: string, s: string) {
    setConta(c); setInicio(i); setFim(f); setStatus(s);
    setLista(await listarMovimentos(c, i, f, s));
  }

  async function montarPrevia(movs: MovimentoBruto[]) {
    if (movs.length === 0) { setPrevia([]); setMsg("Nenhuma movimentação reconhecida — confira o formato/arquivo."); return; }
    const hashes = movs.map(dedupHash);
    const existentes = new Set(await jaImportados(conta, hashes));
    setPrevia(movs.map((mov) => ({ mov, novo: !existentes.has(dedupHash(mov)) })));
    setMsg("");
  }

  async function aoEscolherArquivo(file: File) {
    setPrevia(null); setCabecalhos([]); setTextoCSV(null); setMsg("");
    const texto = await file.text();
    if (/\.ofx$/i.test(file.name) || /<OFX>/i.test(texto)) {
      await montarPrevia(parsearOFX(texto));
    } else {
      const cols = cabecalhosCSV(texto);
      setTextoCSV(texto);
      setCabecalhos(cols);
      const m: MapaCSV = { data: acharCol(cols, ["data", "date"]), valor: acharCol(cols, ["valor", "amount", "montante"]), descricao: acharCol(cols, ["hist", "descr", "memo", "lançamento", "lancamento"]) };
      setMapa(m);
      if (m.data && m.valor) await montarPrevia(parsearCSV(texto, m));
    }
  }

  async function remapear(next: MapaCSV) {
    setMapa(next);
    if (textoCSV && next.data && next.valor) await montarPrevia(parsearCSV(textoCSV, next));
  }

  async function importar() {
    if (!previa) return;
    setBusy(true);
    const r = await importarMovimentos(conta, previa.map((p) => p.mov));
    setBusy(false);
    if ("erro" in r) { setMsg(r.erro); return; }
    setMsg(`${r.inseridos} importada(s), ${r.ignorados} já existentes.`);
    setPrevia(null);
    await recarregar(conta, inicio, fim, status);
  }

  const novos = previa?.filter((p) => p.novo).length ?? 0;
  const creditos = lista.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const debitos = lista.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={conta} onChange={(e) => recarregar(e.target.value, inicio, fim, status)} className={inp}>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <label className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white cursor-pointer">
          Importar extrato (OFX/CSV)
          <input type="file" accept=".ofx,.csv,text/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) aoEscolherArquivo(f); e.target.value = ""; }} />
        </label>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>

      {cabecalhos.length > 0 && !previa && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-linha bg-white p-3 text-sm">
          <span className="text-cinza">Mapear colunas do CSV:</span>
          {(["data", "valor", "descricao"] as const).map((campo) => (
            <label key={campo} className="text-cinza">{campo}
              <select value={mapa[campo]} onChange={(e) => remapear({ ...mapa, [campo]: e.target.value })} className={`${inp} ml-1`}>
                <option value="">—</option>
                {cabecalhos.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {previa && previa.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-texto">Prévia · {previa.length} linha(s), {novos} nova(s)</span>
            <button type="button" disabled={busy || novos === 0} onClick={importar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Importar {novos} nova(s)</button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full text-sm">
              <tbody>
                {previa.map((p, i) => (
                  <tr key={i} className="border-b border-linha/40">
                    <td className="px-2 py-1">{dataBR(p.mov.data)}</td>
                    <td className="px-2 py-1 text-texto">{p.mov.descricao}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${p.mov.valor < 0 ? "text-negativo" : "text-verde"}`}>{formatarMoeda(p.mov.valor)}</td>
                    <td className="px-2 py-1 text-xs">{p.novo ? <span className="text-verde">novo</span> : <span className="text-cinza">já importado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={inicio} onChange={(e) => recarregar(conta, e.target.value, fim, status)} className={inp} />
        <input type="date" value={fim} onChange={(e) => recarregar(conta, inicio, e.target.value, status)} className={inp} />
        <select value={status} onChange={(e) => recarregar(conta, inicio, fim, e.target.value)} className={inp}>
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="conciliada">Conciliada</option>
          <option value="ignorada">Ignorada</option>
        </select>
        <span className="ml-auto text-sm text-cinza">Créditos <strong className="text-verde">{formatarMoeda(creditos)}</strong> · Débitos <strong className="text-negativo">{formatarMoeda(debitos)}</strong></span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-cinza">Nenhuma movimentação no período.</td></tr>}
            {lista.map((m) => (
              <tr key={m.id} className="border-b border-linha/60">
                <td className="px-3 py-1.5">{dataBR(m.data)}</td>
                <td className="px-3 py-1.5 text-texto">{m.descricao}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${m.valor < 0 ? "text-negativo" : "text-verde"}`}>{formatarMoeda(m.valor)}</td>
                <td className="px-3 py-1.5">{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- conciliacao/conciliacao-render` → PASS.

- [ ] **Step 5: `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Conciliacao } from "./Conciliacao";
import { listarContas, listarMovimentos } from "./actions";

export default async function ConciliacaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const inicio = `${hoje.slice(0, 7)}-01`;
  const ultimo = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0)).getUTCDate();
  const fim = `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  const contas = await listarContas();
  const contaInicial = contas[0]?.id ?? "";
  const movimentosIni = contaInicial ? await listarMovimentos(contaInicial, inicio, fim, "") : [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Conciliação bancária" subtitulo="Importe o extrato (OFX/CSV) e veja as movimentações" />
      {contas.length === 0 ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Cadastre uma conta bancária primeiro (Financeiro → Cadastros → Contas).</p>
      ) : (
        <Conciliacao contas={contas} inicio={inicio} fim={fim} contaInicial={contaInicial} movimentosIni={movimentosIni} />
      )}
    </main>
  );
}
```

- [ ] **Step 6: Link no dashboard** — em `src/app/(app)/financeiro/dashboard/page.tsx`, ao lado do link "Relatórios", acrescentar:
```tsx
      <Link href="/financeiro/conciliacao" className="text-sm text-verde underline">Conciliação</Link>
```

- [ ] **Step 7: Rodar tudo** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 8: Commit**
```bash
git add "src/app/(app)/financeiro/conciliacao" "src/app/(app)/financeiro/dashboard/page.tsx" src/tests/conciliacao/conciliacao-render.test.tsx
git commit -m "feat(conciliacao): tela de importação + movimentações + link no dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Conciliação bancária (Fatia A):** importação do extrato bancário em **OFX** e **CSV** (com
  mapeamento de colunas) por conta, com **deduplicação** (não reimporta a mesma linha) e prévia; tela
  **Conciliação** (`/financeiro/conciliacao`) com as movimentações por período e totais de crédito/débito.
```

- [ ] **Step 2: Commit + finalizar**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog da Fatia A de conciliação bancária

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois: `superpowers:finishing-a-development-branch`. **Deploy:** `develop → main` + push + Implantar + validar `/financeiro/conciliacao` (307).

---

## Self-Review

- **Cobertura do spec:** tabela + RLS (T1) ✓; parsers OFX/CSV + dedupHash (T2) ✓; actions import/lista/dedup/contas (T3) ✓; UI upload+mapeamento+prévia+lista + link (T4) ✓; changelog (T5) ✓. Unit (T2) + smoke (T4).
- **Placeholders:** nenhum — todo passo tem código.
- **Consistência de tipos:** `MovimentoBruto`/`MapaCSV` (T2) usados em `actions`/`Conciliacao` (T3/T4); `dedupHash(m)` — assinatura sem `contaId` (o dedup é escopado pela constraint `(conta, dedup_hash)`); `MovimentoView` (T3) na lista (T4). `importarMovimentos` retorna união `{inseridos,ignorados} | {erro}` — a UI trata com `"erro" in r`.
- **Isomorfismo:** `dedupHash`/parsers puros (FNV-1a, sem `node:crypto`) rodam no cliente (prévia) e no servidor (import) com o mesmo resultado.
- **Segurança:** gate `podeGerenciarFinanceiro` + RLS por papel; dedup evita duplicar; sem exposição de dados de outra conta.
- **Escopo:** Fatia A (import + ver). Casamento/baixa/conciliar = Fatia B.
