# Proposta com modelo — Plano de Implementação (Sub-projeto B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar a proposta comercial a partir de um modelo — o padrão da plataforma (alimentado pela Marca) ou um modelo próprio (.docx/HTML estático) enviado pelo escritório, produzindo um PDF baixável.

**Architecture:** Config única no `escritorio_config` decide padrão × próprio. Motor puro monta um mapa `tag→valor` a partir de proposta + Marca + pagamento + responsável. Modelo padrão continua sendo a tela `DocumentoProposta` (Imprimir do navegador), agora com a Marca. Modelo próprio: `.docx` via docxtemplater + Gotenberg/LibreOffice; HTML estático (sanitizado, tags substituídas) via Gotenberg/Chromium. Nada de PDF persiste.

**Tech Stack:** Next.js 16 (App Router, server components/actions), TypeScript, Supabase (Postgres/RLS/Storage), docxtemplater + PizZip, Gotenberg, Vitest.

## Global Constraints

- Next 16: middleware é `proxy.ts`; imagens via `next/image` (nunca `<img>`); alias `@/*` → `./src/*`.
- Segredos server-only; nunca `NEXT_PUBLIC_` para chaves.
- RBAC: papel só de `usuarios.papel` via `auth_papel()`. Páginas de proposta usam `podeCriarCliente(perfil.papel)`; config usa `perfil.papel === "admin"`.
- Migrations: aplicadas por `npm run db:migrate`; imutáveis após aplicadas; novas devem ser idempotentes (`add column if not exists`, `drop policy if exists; create policy`).
- Tags no formato `{tag}` (idêntico em .docx e HTML). Tags ausentes → string vazia.
- HTML de terceiros sempre **sanitizado** (sem `<script>`, `on*`, `javascript:`) e sem depender de JS para renderizar.
- Datas/mês calculados **server-side** (regra `react-hooks/purity`).
- Antes de cada commit: `npm run lint && npm run typecheck && npm test` (e `npm run db:test` quando mexer em RLS).

---

### Task 1: Migration — config de modelo + responsável na proposta

**Files:**
- Create: `supabase/migrations/0077_proposta_modelo.sql`

**Interfaces:**
- Produces (colunas): `escritorio_config.proposta_modelo` ('padrao'|'proprio'), `.proposta_template_path` text, `.proposta_template_tipo` ('docx'|'html'); `proposta.responsavel_nome/email/telefone` text.

- [ ] **Step 1: Escrever a migration**

Arquivo `supabase/migrations/0077_proposta_modelo.sql`:

```sql
-- Sub-projeto B: modelo da proposta (padrão vs próprio) + responsável comercial.
alter table escritorio_config
  add column if not exists proposta_modelo text not null default 'padrao',
  add column if not exists proposta_template_path text,
  add column if not exists proposta_template_tipo text;

do $$ begin
  alter table escritorio_config add constraint escritorio_config_modelo_chk
    check (proposta_modelo in ('padrao','proprio'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table escritorio_config add constraint escritorio_config_tpl_tipo_chk
    check (proposta_template_tipo is null or proposta_template_tipo in ('docx','html'));
exception when duplicate_object then null; end $$;

alter table proposta
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_email text,
  add column if not exists responsavel_telefone text;

comment on column escritorio_config.proposta_modelo is
  'padrao = documento HTML da plataforma (usa a Marca); proprio = template enviado (docx|html).';
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0077_proposta_modelo.sql` sem erro; registra em `app_migrations`.

- [ ] **Step 3: Conferir schema**

Run: `npm run db:test 2>&1 | tail -3`
Expected: suíte segue verde (0 falhas) — as colunas novas não quebram nada.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0077_proposta_modelo.sql
git commit -m "feat: migration 0077 — modelo da proposta + responsável comercial"
```

---

### Task 2: Catálogo de tags + montagem do mapa (função pura, TDD)

**Files:**
- Create: `src/lib/comercial/proposta-template.ts`
- Test: `src/tests/comercial/proposta-template.test.ts`

**Interfaces:**
- Consumes: `totaisProposta` de `@/lib/comercial/proposta`; `formatarDocumento` se existir (senão formata CNPJ inline).
- Produces:
  - `type DadosTags = { proposta: {numero:number; validade:string|null; observacoes:string|null}; cliente: {nome:string; contato:string|null}; itens: {descricao:string; valor:number; recorrencia:"mensal"|"unico"}[]; marca: {nome:string|null; cnpj:string|null; email:string|null; telefone:string|null; endereco:Record<string,string>|null}; responsavel: {nome:string|null; email:string|null; telefone:string|null}; hoje: string /* ISO yyyy-mm-dd */ }`
  - `montarMapaTags(d: DadosTags): { mapa: Record<string,string>; itens: {descricao:string; recorrencia:string; valor:string}[] }`
  - `TAGS_DISPONIVEIS: {tag:string; rotulo:string; grupo:string}[]`
  - `tagsNoTexto(texto: string): string[]` (ignora `#itens` e `/itens`)
  - `formatarMesAno(iso: string): string`, `formatarEnderecoLinha(e: Record<string,string>|null): string`, `formatarBRL(v:number): string`, `formatarDataBR(iso:string|null): string`

- [ ] **Step 1: Escrever os testes (falhando)**

Arquivo `src/tests/comercial/proposta-template.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  montarMapaTags, tagsNoTexto, formatarMesAno, formatarEnderecoLinha, formatarBRL, type DadosTags,
} from "@/lib/comercial/proposta-template";

const base: DadosTags = {
  proposta: { numero: 123, validade: "2026-08-31", observacoes: "Faturamento mensal." },
  cliente: { nome: "Padaria X", contato: "João" },
  itens: [
    { descricao: "Contábil", valor: 1000, recorrencia: "mensal" },
    { descricao: "Abertura", valor: 500, recorrencia: "unico" },
  ],
  marca: { nome: "Elevare", cnpj: "11222333000181", email: "c@e.com", telefone: "3433001774", endereco: { cidade: "Uberlândia", uf: "MG" } },
  responsavel: { nome: "Pedro", email: "p@e.com", telefone: "34999" },
  hoje: "2026-07-11",
};

describe("montarMapaTags", () => {
  it("mapeia todos os grupos", () => {
    const { mapa } = montarMapaTags(base);
    expect(mapa.nome_cliente).toBe("Padaria X");
    expect(mapa.contato_cliente).toBe("João");
    expect(mapa.numero_proposta).toBe("123");
    expect(mapa.mes_ano).toBe("Julho/2026");
    expect(mapa.data_emissao).toBe("11/07/2026");
    expect(mapa.validade).toBe("31/08/2026");
    expect(mapa.condicoes).toBe("Faturamento mensal.");
    expect(mapa.nome_escritorio).toBe("Elevare");
    expect(mapa.cnpj_escritorio).toBe("11.222.333/0001-81");
    expect(mapa.endereco_escritorio).toBe("Uberlândia/MG");
    expect(mapa.responsavel_nome).toBe("Pedro");
    expect(mapa.total_mensal).toBe("R$ 1.000,00");
    expect(mapa.total_unico).toBe("R$ 500,00");
  });
  it("nulos viram string vazia", () => {
    const { mapa } = montarMapaTags({
      ...base,
      proposta: { numero: 1, validade: null, observacoes: null },
      cliente: { nome: "Y", contato: null },
      marca: { nome: null, cnpj: null, email: null, telefone: null, endereco: null },
      responsavel: { nome: null, email: null, telefone: null },
    });
    expect(mapa.validade).toBe("");
    expect(mapa.condicoes).toBe("");
    expect(mapa.cnpj_escritorio).toBe("");
    expect(mapa.endereco_escritorio).toBe("");
    expect(mapa.responsavel_nome).toBe("");
  });
  it("devolve itens formatados para o loop", () => {
    const { itens } = montarMapaTags(base);
    expect(itens).toEqual([
      { descricao: "Contábil", recorrencia: "Mensal", valor: "R$ 1.000,00" },
      { descricao: "Abertura", recorrencia: "Único", valor: "R$ 500,00" },
    ]);
  });
});

describe("tagsNoTexto", () => {
  it("extrai tags e ignora controle de loop", () => {
    const t = tagsNoTexto("Olá {nome_cliente}, {#itens}{descricao}{/itens} {desconhecida}");
    expect(t).toContain("nome_cliente");
    expect(t).toContain("descricao");
    expect(t).toContain("desconhecida");
    expect(t).not.toContain("#itens");
    expect(t).not.toContain("/itens");
  });
});

describe("helpers", () => {
  it("formatarMesAno em pt-BR", () => { expect(formatarMesAno("2026-07-11")).toBe("Julho/2026"); });
  it("formatarEnderecoLinha junta partes", () => {
    expect(formatarEnderecoLinha({ logradouro: "Rua A", numero: "10", cidade: "Uberlândia", uf: "MG" })).toBe("Rua A, 10 · Uberlândia/MG");
  });
  it("formatarEnderecoLinha vazio", () => { expect(formatarEnderecoLinha(null)).toBe(""); });
  it("formatarBRL", () => { expect(formatarBRL(1234.5)).toBe("R$ 1.234,50"); });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- proposta-template`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Arquivo `src/lib/comercial/proposta-template.ts`:

```ts
import { totaisProposta } from "@/lib/comercial/proposta";

export type DadosTags = {
  proposta: { numero: number; validade: string | null; observacoes: string | null };
  cliente: { nome: string; contato: string | null };
  itens: { descricao: string; valor: number; recorrencia: "mensal" | "unico" }[];
  marca: { nome: string | null; cnpj: string | null; email: string | null; telefone: string | null; endereco: Record<string, string> | null };
  responsavel: { nome: string | null; email: string | null; telefone: string | null };
  hoje: string; // ISO yyyy-mm-dd (calculado server-side)
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export function formatarBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function formatarDataBR(iso: string | null): string {
  if (!iso) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
export function formatarMesAno(iso: string): string {
  const mes = MESES[Number(iso.slice(5, 7)) - 1] ?? "";
  return `${mes}/${iso.slice(0, 4)}`;
}
function formatarCnpj(d: string | null): string {
  if (!d) return "";
  const s = d.replace(/\D/g, "");
  if (s.length !== 14) return d;
  return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;
}
export function formatarEnderecoLinha(e: Record<string, string> | null): string {
  if (!e) return "";
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
  const bairro = e.bairro ?? "";
  return [rua, bairro, cidadeUf, e.cep].filter(Boolean).join(" · ");
}

export function montarMapaTags(d: DadosTags): { mapa: Record<string, string>; itens: { descricao: string; recorrencia: string; valor: string }[] } {
  const t = totaisProposta(d.itens);
  const itens = d.itens.map((i) => ({
    descricao: i.descricao,
    recorrencia: i.recorrencia === "mensal" ? "Mensal" : "Único",
    valor: formatarBRL(i.valor),
  }));
  const mapa: Record<string, string> = {
    nome_escritorio: d.marca.nome ?? "",
    cnpj_escritorio: formatarCnpj(d.marca.cnpj),
    email_escritorio: d.marca.email ?? "",
    telefone_escritorio: d.marca.telefone ?? "",
    endereco_escritorio: formatarEnderecoLinha(d.marca.endereco),
    nome_cliente: d.cliente.nome ?? "",
    contato_cliente: d.cliente.contato ?? "",
    numero_proposta: String(d.proposta.numero),
    data_emissao: formatarDataBR(d.hoje),
    mes_ano: formatarMesAno(d.hoje),
    validade: formatarDataBR(d.proposta.validade),
    condicoes: d.proposta.observacoes ?? "",
    responsavel_nome: d.responsavel.nome ?? "",
    responsavel_email: d.responsavel.email ?? "",
    responsavel_telefone: d.responsavel.telefone ?? "",
    total_mensal: formatarBRL(t.mensal),
    total_unico: formatarBRL(t.unico),
  };
  return { mapa, itens };
}

export function tagsNoTexto(texto: string): string[] {
  const set = new Set<string>();
  for (const m of texto.matchAll(/\{([#/]?\w+)\}/g)) {
    const raw = m[1];
    if (raw.startsWith("#") || raw.startsWith("/")) continue;
    set.add(raw);
  }
  return [...set];
}

export const TAGS_DISPONIVEIS: { tag: string; rotulo: string; grupo: string }[] = [
  { tag: "nome_escritorio", rotulo: "Nome do escritório", grupo: "Escritório" },
  { tag: "cnpj_escritorio", rotulo: "CNPJ do escritório", grupo: "Escritório" },
  { tag: "email_escritorio", rotulo: "E-mail do escritório", grupo: "Escritório" },
  { tag: "telefone_escritorio", rotulo: "Telefone do escritório", grupo: "Escritório" },
  { tag: "endereco_escritorio", rotulo: "Endereço do escritório", grupo: "Escritório" },
  { tag: "nome_cliente", rotulo: "Nome do cliente", grupo: "Cliente" },
  { tag: "contato_cliente", rotulo: "Contato do cliente", grupo: "Cliente" },
  { tag: "numero_proposta", rotulo: "Número da proposta", grupo: "Proposta" },
  { tag: "data_emissao", rotulo: "Data de emissão", grupo: "Proposta" },
  { tag: "mes_ano", rotulo: "Mês/ano", grupo: "Proposta" },
  { tag: "validade", rotulo: "Validade", grupo: "Proposta" },
  { tag: "condicoes", rotulo: "Condições (observações)", grupo: "Proposta" },
  { tag: "responsavel_nome", rotulo: "Responsável — nome", grupo: "Responsável" },
  { tag: "responsavel_email", rotulo: "Responsável — e-mail", grupo: "Responsável" },
  { tag: "responsavel_telefone", rotulo: "Responsável — telefone", grupo: "Responsável" },
  { tag: "total_mensal", rotulo: "Total mensal", grupo: "Totais" },
  { tag: "total_unico", rotulo: "Total único", grupo: "Totais" },
];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- proposta-template`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/proposta-template.ts src/tests/comercial/proposta-template.test.ts
git commit -m "feat: catálogo de tags e montagem do mapa da proposta"
```

---

### Task 3: Motor de geração (docx + HTML) e conversão de HTML→PDF (TDD)

**Files:**
- Modify: `src/lib/contrato/gerar.ts` (adicionar `converterPdfHtml`)
- Create: `src/lib/comercial/gerar-proposta.ts`
- Test: `src/tests/comercial/gerar-proposta.test.ts`
- Test: `src/tests/contrato/gerar.test.ts` (adicionar caso de `converterPdfHtml`)

**Interfaces:**
- Consumes: `montarMapaTags` (Task 2), `gerarDocx`/`converterPdf` (existentes).
- Produces:
  - Em `gerar.ts`: `converterPdfHtml(html: string): Promise<Buffer | null>`
  - Em `gerar-proposta.ts`:
    - `renderHtml(template: string, mapa: Record<string,string>, itens: {descricao:string;recorrencia:string;valor:string}[]): string`
    - `sanitizarHtml(html: string): string`
    - `validarTemplate(nome: string, bytes: Uint8Array): { tipo:"docx"|"html"; erro?:string; tagsOk?:string[]; tagsDesconhecidas?:string[]; avisos?:string[] }`

- [ ] **Step 1: Escrever os testes (falhando)**

Arquivo `src/tests/comercial/gerar-proposta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHtml, sanitizarHtml, validarTemplate } from "@/lib/comercial/gerar-proposta";

describe("renderHtml", () => {
  it("substitui tags simples", () => {
    const out = renderHtml("<p>Para: {nome_cliente}</p>", { nome_cliente: "Padaria X" }, []);
    expect(out).toContain("Para: Padaria X");
  });
  it("expande o bloco {#itens}", () => {
    const tpl = "<ul>{#itens}<li>{descricao}: {valor}</li>{/itens}</ul>";
    const out = renderHtml(tpl, {}, [
      { descricao: "A", recorrencia: "Mensal", valor: "R$ 1,00" },
      { descricao: "B", recorrencia: "Único", valor: "R$ 2,00" },
    ]);
    expect(out).toBe("<ul><li>A: R$ 1,00</li><li>B: R$ 2,00</li></ul>");
  });
  it("tag ausente vira vazio", () => {
    expect(renderHtml("<p>{inexistente}</p>", {}, [])).toBe("<p></p>");
  });
});

describe("sanitizarHtml", () => {
  it("remove <script>, on* e javascript:", () => {
    const dirty = `<div onclick="x()"><script>alert(1)</script><a href="javascript:evil()">y</a></div>`;
    const clean = sanitizarHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
  });
});

describe("validarTemplate", () => {
  it("rejeita docx inválido (sem assinatura ZIP)", () => {
    const r = validarTemplate("modelo.docx", new TextEncoder().encode("não é zip"));
    expect(r.erro).toBeTruthy();
  });
  it("aceita HTML e lista tags conhecidas e desconhecidas", () => {
    const html = "<p>{nome_cliente} {total_mensal} {qualquer_coisa}</p>";
    const r = validarTemplate("m.html", new TextEncoder().encode(html));
    expect(r.tipo).toBe("html");
    expect(r.erro).toBeUndefined();
    expect(r.tagsOk).toEqual(expect.arrayContaining(["nome_cliente", "total_mensal"]));
    expect(r.tagsDesconhecidas).toContain("qualquer_coisa");
  });
  it("avisa sobre recurso externo no HTML", () => {
    const html = `<img src="https://cdn.example.com/logo.png">`;
    const r = validarTemplate("m.html", new TextEncoder().encode(html));
    expect(r.avisos?.some((a) => /externo/i.test(a))).toBe(true);
  });
});
```

Adicionar em `src/tests/contrato/gerar.test.ts`:

```ts
import { converterPdfHtml } from "@/lib/contrato/gerar";
// ...
describe("converterPdfHtml", () => {
  it("retorna null sem GOTENBERG_URL", async () => {
    vi.stubEnv("GOTENBERG_URL", "");
    expect(await converterPdfHtml("<p>oi</p>")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- gerar-proposta`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `converterPdfHtml` em `gerar.ts`**

Adicionar ao final de `src/lib/contrato/gerar.ts` (segue o padrão de `converterPdf` — timeout + degradação graciosa):

```ts
// Converte HTML estático -> PDF via Gotenberg (/forms/chromium/convert/html).
// O HTML já vem sanitizado (sem <script>/on*/javascript:), então não há JS a
// executar; recursos devem ser data URI (sem rede externa). Retorna null se a
// URL não estiver configurada ou a conversão falhar.
export async function converterPdfHtml(html: string): Promise<Buffer | null> {
  const base = process.env.GOTENBERG_URL;
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    const resp = await fetch(`${base}/forms/chromium/convert/html`, { method: "POST", body: form, signal: ctrl.signal });
    if (!resp.ok) {
      console.error("converterPdfHtml: Gotenberg respondeu", resp.status);
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error("converterPdfHtml:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Implementar `gerar-proposta.ts`**

Arquivo `src/lib/comercial/gerar-proposta.ts`:

```ts
import { tagsNoTexto, TAGS_DISPONIVEIS } from "@/lib/comercial/proposta-template";

type Item = { descricao: string; recorrencia: string; valor: string };

// Expande {#itens}...{/itens} e substitui {tag}. Tags ausentes viram vazio.
export function renderHtml(template: string, mapa: Record<string, string>, itens: Item[]): string {
  const comLoop = template.replace(/\{#itens\}([\s\S]*?)\{\/itens\}/g, (_m, bloco: string) =>
    itens.map((it) => bloco.replace(/\{(\w+)\}/g, (_x, k: string) => (it as Record<string, string>)[k] ?? "")).join(""),
  );
  return comLoop.replace(/\{(\w+)\}/g, (_m, k: string) => mapa[k] ?? "");
}

// Remove vetores de execução: <script>, atributos on*, e URLs javascript:.
export function sanitizarHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

const CONHECIDAS = new Set([...TAGS_DISPONIVEIS.map((t) => t.tag), "descricao", "recorrencia", "valor"]);
const EXTERNO = /(?:src|href)\s*=\s*["']https?:\/\//i;
const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];

export function validarTemplate(nome: string, bytes: Uint8Array): {
  tipo: "docx" | "html"; erro?: string; tagsOk?: string[]; tagsDesconhecidas?: string[]; avisos?: string[];
} {
  const ext = nome.toLowerCase().endsWith(".docx") ? "docx" : nome.toLowerCase().endsWith(".html") || nome.toLowerCase().endsWith(".htm") ? "html" : null;
  if (!ext) return { tipo: "html", erro: "Envie um arquivo .docx ou .html." };

  if (ext === "docx") {
    const ok = bytes.length >= 4 && ZIP_SIG.every((b, i) => bytes[i] === b);
    if (!ok) return { tipo: "docx", erro: "Arquivo .docx inválido." };
    return { tipo: "docx" };
  }

  const texto = new TextDecoder().decode(bytes);
  const tags = tagsNoTexto(texto);
  const tagsOk = tags.filter((t) => CONHECIDAS.has(t));
  const tagsDesconhecidas = tags.filter((t) => !CONHECIDAS.has(t));
  const avisos: string[] = [];
  if (EXTERNO.test(texto)) avisos.push("O HTML referencia um recurso externo (http). Embuta imagens/estilos como data URI — recursos externos não são carregados na geração.");
  return { tipo: "html", tagsOk, tagsDesconhecidas, avisos };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- gerar-proposta gerar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contrato/gerar.ts src/lib/comercial/gerar-proposta.ts src/tests/comercial/gerar-proposta.test.ts src/tests/contrato/gerar.test.ts
git commit -m "feat: motor de geração da proposta (docx+html) e converterPdfHtml"
```

---

### Task 4: Responsável comercial na proposta (view + actions + editor)

**Files:**
- Modify: `src/app/(app)/comercial/propostas-actions.ts` (`PropostaView`, `obterProposta`, `salvarProposta`, `ItemInput`/assinatura de salvar)
- Modify: `src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/page.tsx` (passar padrão do responsável)

**Interfaces:**
- Consumes: `getPerfilAtual` (nome do usuário); `createServerSupabase().auth.getUser()` (e-mail do usuário — o perfil não tem e-mail).
- Produces: `PropostaView` ganha `responsavel: { nome:string|null; email:string|null; telefone:string|null }`; `salvarProposta` passa a aceitar `responsavel` no objeto `dados`.

- [ ] **Step 1: Estender `PropostaView` e `obterProposta`**

Em `propostas-actions.ts`:
- No tipo `PropostaView`, adicionar: `responsavel: { nome: string | null; email: string | null; telefone: string | null };`
- No `select` de `obterProposta`, incluir `responsavel_nome, responsavel_email, responsavel_telefone`.
- No retorno, adicionar:

```ts
responsavel: {
  nome: (pr.responsavel_nome as string | null) ?? null,
  email: (pr.responsavel_email as string | null) ?? null,
  telefone: (pr.responsavel_telefone as string | null) ?? null,
},
```

- [ ] **Step 2: Estender `salvarProposta`**

Alterar a assinatura para aceitar responsável:

```ts
export async function salvarProposta(id: string, dados: { validade: string | null; observacoes: string | null; itens: ItemInput[]; responsavel: { nome: string | null; email: string | null; telefone: string | null } }): Promise<{ ok?: boolean; erro?: string }> {
```

E o `update` da tabela `proposta` passa a gravar também:

```ts
.update({
  validade: dados.validade,
  observacoes: dados.observacoes,
  responsavel_nome: dados.responsavel.nome,
  responsavel_email: dados.responsavel.email,
  responsavel_telefone: dados.responsavel.telefone,
  atualizado_em: new Date().toISOString(),
})
```

- [ ] **Step 3: Passar o padrão do responsável na page**

Em `[id]/page.tsx`, após obter `perfil` e `proposta`, ler o e-mail do usuário e passar ao editor:

```ts
const supabase = await createServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
const responsavelPadrao = { nome: perfil.nome, email: user?.email ?? "" };
// ...
<EditorProposta proposta={proposta} responsavelPadrao={responsavelPadrao} />
```

(import de `createServerSupabase` de `@/lib/supabase/server`.)

- [ ] **Step 4: Adicionar os 3 campos no `EditorProposta`**

- Novo prop: `responsavelPadrao: { nome: string; email: string }`.
- Novos estados, com fallback ao padrão do usuário logado:

```ts
const [respNome, setRespNome] = useState(proposta.responsavel.nome ?? responsavelPadrao.nome);
const [respEmail, setRespEmail] = useState(proposta.responsavel.email ?? responsavelPadrao.email);
const [respTelefone, setRespTelefone] = useState(proposta.responsavel.telefone ?? "");
```

- Incluir no `salvar()`: `responsavel: { nome: respNome || null, email: respEmail || null, telefone: respTelefone || null }`.
- Renderizar um bloco "Responsável comercial" com três inputs (nome, e-mail, telefone), no mesmo estilo dos campos existentes.

- [ ] **Step 5: Verificar**

Run: `npm run lint && npm run typecheck && npm test -- proposta`
Expected: sem erros; testes de proposta seguem verdes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/comercial/propostas-actions.ts" "src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx" "src/app/(app)/comercial/propostas/[id]/page.tsx"
git commit -m "feat: responsável comercial na proposta (campos + persistência)"
```

---

### Task 5: Configuração do modelo (padrão/próprio + upload + referência + exemplo)

**Files:**
- Create: `src/app/(app)/configuracoes/marca/proposta-actions.ts`
- Create: `src/app/(app)/configuracoes/marca/FormProposta.tsx`
- Modify: `src/app/(app)/configuracoes/marca/page.tsx` (renderizar `FormProposta`)

**Interfaces:**
- Consumes: `createAdminSupabase`, `createServerSupabase`, `getPerfilAtual`; `validarTemplate` (Task 3); `TAGS_DISPONIVEIS`, `montarMapaTags` (Task 2).
- Produces:
  - `salvarModeloProposta(_prev, fd): Promise<EstadoProposta>` — grava `proposta_modelo`.
  - `enviarTemplateProposta(_prev, fd): Promise<EstadoProposta>` — valida, faz upload, grava `template_path`/`template_tipo`, remove o anterior.
  - `baixarExemploHtml(): Promise<string>` — HTML de exemplo com todas as tags.
  - `type EstadoProposta = { erro?: string; ok?: boolean; tagsOk?: string[]; tagsDesconhecidas?: string[]; avisos?: string[] }`

- [ ] **Step 1: Escrever `proposta-actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { validarTemplate } from "@/lib/comercial/gerar-proposta";
import { TAGS_DISPONIVEIS } from "@/lib/comercial/proposta-template";

export type EstadoProposta = { erro?: string; ok?: boolean; tagsOk?: string[]; tagsDesconhecidas?: string[]; avisos?: string[] };

async function exigirAdmin(): Promise<boolean> {
  const p = await getPerfilAtual();
  return Boolean(p?.ativo && p.papel === "admin");
}

export async function salvarModeloProposta(_prev: EstadoProposta, fd: FormData): Promise<EstadoProposta> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const modelo = String(fd.get("modelo") ?? "padrao");
  if (modelo !== "padrao" && modelo !== "proprio") return { erro: "Modelo inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("escritorio_config").update({ proposta_modelo: modelo }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function enviarTemplateProposta(_prev: EstadoProposta, fd: FormData): Promise<EstadoProposta> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = fd.get("template") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 5 * 1024 * 1024) return { erro: "Modelo acima de 5 MB." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const val = validarTemplate(arquivo.name, bytes);
  if (val.erro) return { erro: val.erro };

  const admin = createAdminSupabase();
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase.from("escritorio_config").select("proposta_template_path").eq("id", 1).maybeSingle();

  const path = `marca/proposta-template.${val.tipo}`;
  const contentType = val.tipo === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/html";
  const { error: upErr } = await admin.storage.from("documentos").upload(path, bytes, { contentType, upsert: true });
  if (upErr) return { erro: "Falha ao enviar o modelo." };

  const { error } = await supabase.from("escritorio_config").update({ proposta_template_path: path, proposta_template_tipo: val.tipo }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar o modelo." };
  // se o tipo mudou (troca docx<->html), remove o arquivo anterior de tipo diferente
  const anterior = atual?.proposta_template_path as string | null;
  if (anterior && anterior !== path) await admin.storage.from("documentos").remove([anterior]);
  revalidatePath("/configuracoes/marca");
  return { ok: true, tagsOk: val.tagsOk, tagsDesconhecidas: val.tagsDesconhecidas, avisos: val.avisos };
}

export async function baixarExemploHtml(): Promise<string> {
  const linhas = TAGS_DISPONIVEIS.map((t) => `    <tr><td>${t.rotulo}</td><td>{${t.tag}}</td></tr>`).join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Modelo de exemplo — Proposta</title></head>
<body>
  <h1>Proposta para {nome_cliente}</h1>
  <p>{mes_ano} · Nº {numero_proposta}</p>
  <table border="1" cellpadding="4">
    <tr><th>Campo</th><th>Tag</th></tr>
${linhas}
  </table>
  <h2>Itens</h2>
  <ul>{#itens}<li>{descricao} — {recorrencia}: {valor}</li>{/itens}</ul>
  <p>Total mensal: {total_mensal} · Total único: {total_unico}</p>
  <hr>
  <p>{responsavel_nome} · {responsavel_email} · {responsavel_telefone}</p>
</body></html>`;
}
```

- [ ] **Step 2: Escrever `FormProposta.tsx`**

Client component com:
- rádio Modelo padrão / próprio (form → `salvarModeloProposta` via `useActionState`);
- form de upload (`accept=".docx,.html"`, form → `enviarTemplateProposta`), exibindo `tagsOk`/`tagsDesconhecidas`/`avisos` do estado;
- painel de referência listando `TAGS_DISPONIVEIS` agrupado por `grupo` (tags copiáveis) — serve tanto para HTML quanto para .docx (basta copiar a tag no Word);
- botão "Baixar exemplo (HTML)" que chama `baixarExemploHtml()` e dispara download via Blob no cliente.

Props: `modelo: "padrao"|"proprio"`, `templateTipo: "docx"|"html"|null`, `temTemplate: boolean`.

Observação (ajuste ao spec): o exemplo baixável é **HTML**; para `.docx` o usuário copia as tags do painel de referência para o Word (evita sintetizar um `.docx` sem dependência nova). A referência + validação no upload cobrem a descoberta de tags nos dois formatos.

- [ ] **Step 3: Renderizar em `page.tsx`**

Na `MarcaPage`, ler os campos novos de `escritorio_config` (`proposta_modelo`, `proposta_template_tipo`, `proposta_template_path`) e renderizar `<FormProposta ... />` abaixo do `FormMarca`.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/marca/proposta-actions.ts" "src/app/(app)/configuracoes/marca/FormProposta.tsx" "src/app/(app)/configuracoes/marca/page.tsx"
git commit -m "feat: configuração do modelo de proposta (padrão/próprio, upload, tags, exemplo)"
```

---

### Task 6: Modelo padrão ligado à Marca

**Files:**
- Modify: `src/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/documento/page.tsx`

**Interfaces:**
- Consumes: `escritorio_config` (nome/cnpj/endereço) + `urlLogoAtual()` de `@/app/(app)/configuracoes/marca/actions`.
- Produces: `DocumentoProposta` passa a receber `marca: { nome, cnpj, enderecoLinha } ` e `logoUrl: string|null`.

- [ ] **Step 1: `page.tsx` carrega a Marca**

Em `documento/page.tsx`: ler `escritorio_config` (nome, cnpj, endereco) via `createServerSupabase`, montar `enderecoLinha` com `formatarEnderecoLinha`, obter `logoUrl` via `urlLogoAtual()`, e passar ao componente.

- [ ] **Step 2: `DocumentoProposta.tsx` usa a Marca**

- Novos props: `marca: { nome: string | null; cnpj: string | null; enderecoLinha: string }`, `logoUrl: string | null`.
- No `<header>`: se `logoUrl`, renderizar `<Image src={logoUrl} alt="Logo" width={140} height={56} className="mb-2 max-h-14 w-auto object-contain" unoptimized />`.
- Trocar o título de escritório: usar `marca.nome` (fallback `pg.titular`) e mostrar `marca.cnpj`/`marca.enderecoLinha` abaixo.
- Import de `next/image`.

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros (atenção ao import de `Image` usado).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/comercial/propostas/[id]/documento/DocumentoProposta.tsx" "src/app/(app)/comercial/propostas/[id]/documento/page.tsx"
git commit -m "feat: documento padrão da proposta usa a Marca (logo, nome, CNPJ, endereço)"
```

---

### Task 7: Gerar PDF a partir do modelo próprio (action + botão + download)

**Files:**
- Create: `src/app/(app)/comercial/propostas/[id]/gerar-actions.ts`
- Modify: `src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx` (botão "Gerar documento")

**Interfaces:**
- Consumes: `obterProposta`, `escritorio_config`, `dados_bancarios` (não usado no próprio), `montarMapaTags`, `gerarDocx`/`converterPdf`, `renderHtml`/`sanitizarHtml`/`converterPdfHtml`, `createAdminSupabase` (baixar template do Storage).
- Produces: `gerarDocumentoProposta(id): Promise<{ erro?: string; modelo?: "padrao"; pdfBase64?: string; nome?: string }>`
  (Quando `modelo = padrao`, devolve `{ modelo: "padrao" }` e o cliente navega para `/documento`.)

- [ ] **Step 1: Escrever `gerar-actions.ts`**

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { obterProposta } from "../../propostas-actions";
import { montarMapaTags } from "@/lib/comercial/proposta-template";
import { gerarDocx, converterPdf, converterPdfHtml } from "@/lib/contrato/gerar";
import { renderHtml, sanitizarHtml } from "@/lib/comercial/gerar-proposta";

export async function gerarDocumentoProposta(id: string): Promise<{ erro?: string; modelo?: "padrao"; pdfBase64?: string; nome?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("escritorio_config").select("proposta_modelo, proposta_template_path, proposta_template_tipo, nome, cnpj, email, telefone, endereco").eq("id", 1).maybeSingle();
  if (!cfg || cfg.proposta_modelo !== "proprio") return { modelo: "padrao" };
  if (!cfg.proposta_template_path) return { erro: "Nenhum modelo enviado. Envie um em Configurações → Marca." };

  const proposta = await obterProposta(id);
  if (!proposta) return { erro: "Proposta não encontrada." };

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { mapa, itens } = montarMapaTags({
    proposta: { numero: proposta.numero, validade: proposta.validade, observacoes: proposta.observacoes },
    cliente: { nome: proposta.prospectNome, contato: proposta.contatoNome },
    itens: proposta.itens.map((i) => ({ descricao: i.descricao, valor: i.valor, recorrencia: i.recorrencia })),
    marca: { nome: cfg.nome as string | null, cnpj: cfg.cnpj as string | null, email: cfg.email as string | null, telefone: cfg.telefone as string | null, endereco: cfg.endereco as Record<string, string> | null },
    responsavel: proposta.responsavel,
    hoje,
  });

  const admin = createAdminSupabase();
  const { data: blob, error } = await admin.storage.from("documentos").download(cfg.proposta_template_path as string);
  if (error || !blob) return { erro: "Falha ao ler o modelo." };
  const bytes = Buffer.from(await blob.arrayBuffer());

  let pdf: Buffer | null = null;
  if (cfg.proposta_template_tipo === "docx") {
    pdf = await converterPdf(gerarDocx(bytes, mapa));
  } else {
    const html = sanitizarHtml(renderHtml(bytes.toString("utf8"), mapa, itens));
    pdf = await converterPdfHtml(html);
  }
  if (!pdf) return { erro: "Conversão para PDF indisponível no momento. Tente novamente." };
  return { pdfBase64: pdf.toString("base64"), nome: `proposta-${proposta.numero}.pdf` };
}
```

- [ ] **Step 2: Botão no `EditorProposta`**

- Adicionar botão "Gerar documento" (ao lado de "Ver documento").
- Handler:

```ts
async function gerar() {
  setOcupado(true);
  const r = await gerarDocumentoProposta(proposta.id);
  setOcupado(false);
  if (r.erro) return alert(r.erro);
  if (r.modelo === "padrao") { router.push(`/comercial/propostas/${proposta.id}/documento`); return; }
  if (r.pdfBase64 && r.nome) {
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = r.nome; a.click();
    URL.revokeObjectURL(url);
  }
}
```

- Import de `gerarDocumentoProposta` de `./gerar-actions`.

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/comercial/propostas/[id]/gerar-actions.ts" "src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx"
git commit -m "feat: gerar PDF da proposta a partir do modelo próprio (docx/html)"
```

---

### Task 8: Semente ELEVARE — script para achatar o bundle em HTML estático

**Files:**
- Create: `scripts/achatar-proposta.mjs`

**Interfaces:**
- Consumes: caminho de um HTML empacotado (bundle) como argumento.
- Produces: um HTML estático (marcação + assets em data URI, sem `<script>`), com `〔 … 〕` trocados pelas tags — impresso no stdout / gravado no caminho de saída. **Não commitar o artefato gerado** (contém o design específico do escritório); o admin envia o arquivo pela UI de Configurações → Marca.

- [ ] **Step 1: Escrever o script**

`scripts/achatar-proposta.mjs` (JS puro, fora do `tsc`):
- Lê o arquivo; extrai `<script type="__bundler/template">` (JSON) e `<script type="__bundler/manifest">` (JSON de assets base64/gzip).
- Descompacta cada asset (gzip via `zlib.gunzipSync` quando `compressed`), monta `data:<mime>;base64,<...>` e substitui os UUIDs no template.
- Remove todos os `<script>...</script>` do template (não há hidratação/JS).
- Substitui os placeholders visíveis pelo padrão de tags:
  `〔 Nome do Cliente 〕`→`{nome_cliente}`, `〔 Mês/Ano 〕`→`{mes_ano}`, `〔 Nome do responsável 〕`→`{responsavel_nome}`, `〔 e-mail 〕`→`{responsavel_email}`, `〔 telefone 〕`→`{responsavel_telefone}`.
- Escreve o resultado no caminho de saída (2º argumento).

- [ ] **Step 2: Rodar contra o modelo da ELEVARE (validação manual)**

Run: `node scripts/achatar-proposta.mjs "<caminho-do-bundle>" /private/tmp/claude-501/-Users-pedrogomes/f23f6524-f7b9-47dc-b5d0-85ec383cc817/scratchpad/proposta-elevare.html`
Expected: gera o HTML estático; conferir que não há `<script`, que os `{tags}` aparecem e que as imagens viraram `data:`.

Run (conferência):
```bash
grep -c "<script" /private/tmp/claude-501/-Users-pedrogomes/f23f6524-f7b9-47dc-b5d0-85ec383cc817/scratchpad/proposta-elevare.html   # esperado: 0
grep -oE "\{[a-z_]+\}" /private/tmp/claude-501/-Users-pedrogomes/f23f6524-f7b9-47dc-b5d0-85ec383cc817/scratchpad/proposta-elevare.html | sort -u
```

- [ ] **Step 3: Lint do script**

Run: `npm run lint`
Expected: sem erros (scripts são cobertos pelo ESLint).

- [ ] **Step 4: Commit (apenas o script)**

```bash
git add scripts/achatar-proposta.mjs
git commit -m "feat: script para achatar bundle de proposta em HTML estático com tags"
```

---

### Task 9: Testes de RLS + documentação

**Files:**
- Modify: `supabase/tests/rls.test.sql`
- Modify: `docs/DOCUMENTACAO.md`

- [ ] **Step 1: Assert de RLS das colunas novas**

Adicionar bloco ao final de `rls.test.sql` (mesmo padrão do assert da Marca): financeiro NÃO altera `proposta_modelo`; admin altera com efeito.

```sql
-- ASSERT: escritorio_config.proposta_modelo — só admin escreve
do $$
declare v text;
begin
  reset role;
  update escritorio_config set proposta_modelo = 'padrao' where id = 1;

  perform _simular('00000000-0000-0000-0000-000000000004'); -- financeiro
  update escritorio_config set proposta_modelo = 'proprio' where id = 1;
  reset role;
  select proposta_modelo into v from escritorio_config where id = 1;
  if v <> 'padrao' then raise exception 'FALHA: financeiro alterou proposta_modelo (=%)', v; end if;

  perform _simular('00000000-0000-0000-0000-000000000001'); -- admin
  update escritorio_config set proposta_modelo = 'proprio' where id = 1;
  reset role;
  select proposta_modelo into v from escritorio_config where id = 1;
  if v <> 'proprio' then raise exception 'FALHA: admin não alterou proposta_modelo (=%)', v; end if;
  raise notice 'OK: só admin altera proposta_modelo';
end $$;
```

- [ ] **Step 2: Rodar RLS**

Run: `npm run db:test 2>&1 | grep -iE "FALHA|proposta_modelo"`
Expected: `OK: só admin altera proposta_modelo`; nenhuma `FALHA`.

- [ ] **Step 3: Documentação**

Em `docs/DOCUMENTACAO.md`:
- Na seção **Comercial → Propostas**: descrever geração por modelo (padrão usa a Marca; próprio via .docx/HTML com tags), o responsável comercial e o PDF baixável.
- Na seção **Configurações → Marca**: acrescentar o bloco "Proposta" (escolha padrão/próprio, upload do modelo, referência de tags, exemplo, validação).

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls.test.sql docs/DOCUMENTACAO.md
git commit -m "test+docs: RLS do modelo de proposta e documentação"
```

---

## Self-Review (cobertura do spec)

- Seleção no nível do escritório → Task 1 (coluna) + Task 5 (UI). ✔
- Formatos .docx + HTML → Task 3 (motor) + Task 7 (geração). ✔
- PDF na hora + download → Task 7. ✔
- Modelo próprio = design + tags; itens só no padrão (loop opcional no próprio) → Task 2/3/7. ✔
- HTML estático, JS off, sem rede externa → Task 3 (sanitizar + validar externo) + `converterPdfHtml`. ✔
- Responsável na proposta (pré-preenchido) → Task 4. ✔
- Catálogo de tags (referência + exemplo + validação no upload) → Task 2 + Task 5. ✔
- Modelo padrão ligado à Marca → Task 6. ✔
- Semente ELEVARE → Task 8. ✔
- RLS + docs → Task 9. ✔

**Ajustes registrados vs. spec:**
- Exemplo baixável é **HTML** (não .docx); para .docx o usuário copia as tags do painel de referência — evita sintetizar um .docx sem dependência nova. Descoberta de tags segue coberta (referência + validação + exemplo).
- E-mail do responsável vem do usuário de auth (`auth.getUser()`), pois `getPerfilAtual` não expõe e-mail.
- Pagamento no documento padrão continua vindo de `dados_bancarios` (id=1).
