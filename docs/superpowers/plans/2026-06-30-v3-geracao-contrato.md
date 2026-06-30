# V3 — Geração automática do contrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar o contrato de prestação de serviços contábeis de um cliente preenchendo a minuta padrão (Word) com os dados do CRM, convertendo para PDF e salvando ambos nos Documentos do cliente.

**Architecture:** Camada de geração pura e testável (`src/lib/contrato/*`) que monta o mapa tag→valor a partir do cliente, preenche a minuta tagueada com **docxtemplater** e converte para PDF via **Gotenberg** (HTTP). Uma server action orquestra leitura (RLS) → geração → upload nos Documentos (módulo da V1).

**Tech Stack:** Next.js 16 + TypeScript · Supabase · Vitest · `docxtemplater` + `pizzip` (preenchimento .docx) · `extenso` (valor por extenso) · Gotenberg (docx→pdf via Docker).

## Global Constraints

- **Next 16:** middleware é `src/proxy.ts`; alias `@/*` (→ `./src/*`); imagens via `next/image`.
- **RBAC fonte única:** papel só em `usuarios.papel` via `auth_papel()`; helpers em `src/lib/clientes/permissoes.ts`.
- **Financeiro isolado:** o contrato contém o honorário → gerar contrato exige `podeVerHonorario(papel)` (admin/financeiro/contador-dono). Assistente NÃO gera.
- **Banco:** migrations idempotentes em `supabase/migrations/NNNN_*.sql` via `npm run db:migrate`; imutáveis após aplicadas.
- **Documentos:** upload roda via `createAdminSupabase()` (service_role); bucket `documentos`; tabela `documentos` (cliente_id, nome, tipo, caminho_storage, enviado_por). Padrão em `src/app/(app)/documentos/actions.ts`.
- **LGPD:** dados pessoais não saem da infra — Gotenberg é serviço próprio; arquivos temporários apagados.
- **Comandos antes de commitar:** `npm run lint && npm run typecheck && npm test`. Rodar da raiz `/Users/pedrogomes/crm-contabil` na branch `develop`.
- **Datas:** formatar a vigência a partir da string `YYYY-MM-DD` SEM `new Date()` (evita deslocamento de fuso) — split e reordena.

---

## File Structure

- `src/lib/contrato/extenso.ts` — `reaisPorExtenso(valor: number): string`.
- `src/lib/contrato/dados.ts` — `montarDadosContrato(...)`, tipo `ClienteContrato`.
- `src/lib/contrato/gerar.ts` — `gerarDocx(template, dados): Buffer`, `converterPdf(docx): Promise<Buffer|null>`.
- `src/lib/format.ts` — (modificar) `formatarDocumento`, `formatarCep`, `formatarMoeda`.
- `supabase/migrations/0017_clientes_representante.sql`.
- `src/components/FormCliente.tsx` — (modificar) fieldset "Representante legal".
- `src/app/(app)/clientes/actions.ts` — (modificar) `montarRepresentante` + persistir.
- `src/app/(app)/clientes/[id]/page.tsx` — (modificar) carregar `representante`; render `GerarContrato`.
- `src/app/(app)/clientes/[id]/contrato.ts` — server action `gerarContrato` + tipo de estado.
- `src/components/contrato/GerarContrato.tsx` — UI.
- `templates/contrato-prestacao-servicos.docx` — minuta tagueada (versionada).
- `Dockerfile` / `docs/DEPLOY.md` — (modificar) serviço Gotenberg + `GOTENBERG_URL`.
- Testes: `src/tests/contrato/extenso.test.ts`, `format.test.ts` (existe — acrescentar), `dados.test.ts`, `gerar.test.ts`.

---

## Task 1: Dependências + valor por extenso

**Files:** Create `src/lib/contrato/extenso.ts`, `src/tests/contrato/extenso.test.ts`; Modify `package.json`.

**Interfaces:** Produces `export function reaisPorExtenso(valor: number): string`.

- [ ] **Step 1: Instalar dependências**

Run: `npm install docxtemplater@3.65.2 pizzip@3.2.0 extenso@4.1.0`
Expected: as três entram em `dependencies`.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/tests/contrato/extenso.test.ts
import { describe, it, expect } from "vitest";
import { reaisPorExtenso } from "@/lib/contrato/extenso";

describe("reaisPorExtenso", () => {
  it("inclui 'reais' e o valor em palavras", () => {
    expect(reaisPorExtenso(1500).toLowerCase()).toContain("reais");
    expect(reaisPorExtenso(1).toLowerCase()).toContain("um real");
  });
  it("inclui centavos quando há fração", () => {
    expect(reaisPorExtenso(1452.5).toLowerCase()).toContain("centavos");
  });
  it("valor zero ou inválido vira string vazia", () => {
    expect(reaisPorExtenso(0)).toBe("");
    expect(reaisPorExtenso(NaN)).toBe("");
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npm test -- src/tests/contrato/extenso.test.ts`
Expected: FALHA (módulo inexistente).

- [ ] **Step 4: Implementar `extenso.ts`**

```ts
// src/lib/contrato/extenso.ts
import extenso from "extenso";

// "Reais por extenso" (ex.: 1452.5 -> "mil quatrocentos e cinquenta e dois reais
// e cinquenta centavos"). A lib aceita o número com vírgula decimal.
export function reaisPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  const txt = valor.toFixed(2).replace(".", ",");
  try {
    return extenso(txt, { mode: "currency" }) as string;
  } catch {
    return "";
  }
}
```

> Se o `import extenso from "extenso"` não tipar, adicionar `// @ts-expect-error sem tipos` na linha do import. O teste valida o comportamento real da lib.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- src/tests/contrato/extenso.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/contrato/extenso.test.ts
git add package.json package-lock.json src/lib/contrato/extenso.ts src/tests/contrato/extenso.test.ts
git commit -m "feat(contrato): dependências (docxtemplater/pizzip/extenso) + valor por extenso"
```

---

## Task 2: Formatadores (CNPJ/CPF, CEP, moeda)

**Files:** Modify `src/lib/format.ts`, `src/tests/format.test.ts`.

**Interfaces:** Produces `formatarDocumento(doc: string): string`, `formatarCep(cep: string): string`, `formatarMoeda(valor: number): string`.

- [ ] **Step 1: Escrever os testes que falham** (acrescentar ao `src/tests/format.test.ts`)

```ts
import { formatarDocumento, formatarCep, formatarMoeda } from "@/lib/format";

describe("formatadores de contrato", () => {
  it("formata CNPJ (14 díg) e CPF (11 díg)", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("123")).toBe("123"); // tamanho inesperado: devolve cru
  });
  it("formata CEP de 8 dígitos", () => {
    expect(formatarCep("38407162")).toBe("38407-162");
    expect(formatarCep("")).toBe("");
  });
  it("formata moeda em BRL", () => {
    expect(formatarMoeda(1500)).toBe("R$ 1.500,00");
    expect(formatarMoeda(1452.5)).toBe("R$ 1.452,50");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/format.test.ts`
Expected: FALHA (funções inexistentes).

- [ ] **Step 3: Implementar em `src/lib/format.ts`** (acrescentar ao final)

```ts
import { soDigitos } from "@/lib/format"; // já existe neste arquivo — NÃO re-import; usar a função local

// Formata CPF (11) ou CNPJ (14); tamanho inesperado devolve só os dígitos.
export function formatarDocumento(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

export function formatarCep(cep: string): string {
  const d = soDigitos(cep);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : d;
}

export function formatarMoeda(valor: number): string {
  return "R$ " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

> `soDigitos` já está definido em `format.ts` (mesmo arquivo) — **não** adicionar o import; chamar diretamente.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/format.test.ts
git add src/lib/format.ts src/tests/format.test.ts
git commit -m "feat(contrato): formatadores de CNPJ/CPF, CEP e moeda"
```

---

## Task 3: Montagem dos dados do contrato

**Files:** Create `src/lib/contrato/dados.ts`, `src/tests/contrato/dados.test.ts`.

**Interfaces:**
- Consumes: `formatarDocumento`, `formatarCep`, `formatarMoeda` (T2), `reaisPorExtenso` (T1).
- Produces:
  - `type ClienteContrato = { razao_social: string; cpf_cnpj: string; endereco: Record<string,string>|null; email: string|null; telefone: string|null; responsavel_nome: string|null; representante: Record<string,string>|null }`
  - `export function montarDadosContrato(cliente: ClienteContrato, honorarioMensal: number|null, vigenciaInicio: string): { dados: Record<string,string>; faltando: string[] }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/contrato/dados.test.ts
import { describe, it, expect } from "vitest";
import { montarDadosContrato, type ClienteContrato } from "@/lib/contrato/dados";

const completo: ClienteContrato = {
  razao_social: "ACME LTDA",
  cpf_cnpj: "11222333000181",
  endereco: { logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG", cep: "38400000" },
  email: "a@ex.com",
  telefone: "34 99999-0000",
  responsavel_nome: "Fulano de Tal",
  representante: { nacionalidade: "brasileiro", estado_civil: "casado", profissao: "empresário", rg: "MG-1", cpf: "52998224725" },
};

describe("montarDadosContrato", () => {
  it("monta e formata todas as tags", () => {
    const { dados } = montarDadosContrato(completo, 1500, "2026-07-01");
    expect(dados.razao_social).toBe("ACME LTDA");
    expect(dados.cnpj).toBe("11.222.333/0001-81");
    expect(dados.endereco).toContain("Rua A");
    expect(dados.endereco).toContain("Uberlândia/MG");
    expect(dados.cep).toBe("38400-000");
    expect(dados.rep_nome).toBe("Fulano de Tal");
    expect(dados.rep_cpf).toBe("529.982.247-25");
    expect(dados.honorario).toBe("R$ 1.500,00");
    expect(dados.honorario_extenso.toLowerCase()).toContain("reais");
    expect(dados.vigencia_inicio).toBe("01/07/2026"); // sem deslocamento de fuso
  });
  it("lista campos faltando e devolve string vazia para eles", () => {
    const semRep: ClienteContrato = { ...completo, representante: null, responsavel_nome: null };
    const { dados, faltando } = montarDadosContrato(semRep, null, "2026-07-01");
    expect(dados.rep_cpf).toBe("");
    expect(dados.honorario).toBe("");
    expect(faltando).toContain("Honorário");
    expect(faltando).toContain("Nome do representante");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/contrato/dados.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `dados.ts`**

```ts
// src/lib/contrato/dados.ts
import { formatarDocumento, formatarCep, formatarMoeda } from "@/lib/format";
import { reaisPorExtenso } from "./extenso";

export type ClienteContrato = {
  razao_social: string;
  cpf_cnpj: string;
  endereco: Record<string, string> | null;
  email: string | null;
  telefone: string | null;
  responsavel_nome: string | null;
  representante: Record<string, string> | null;
};

function enderecoLinha(e: Record<string, string> | null): string {
  if (!e) return "";
  const cidadeUf = e.cidade && e.uf ? `${e.cidade}/${e.uf}` : (e.cidade ?? e.uf ?? "");
  return [e.logradouro, e.numero, e.complemento, e.bairro, cidadeUf].filter(Boolean).join(", ");
}

// "YYYY-MM-DD" -> "DD/MM/AAAA" sem new Date() (evita deslocamento de fuso).
function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function montarDadosContrato(
  cliente: ClienteContrato,
  honorarioMensal: number | null,
  vigenciaInicio: string,
): { dados: Record<string, string>; faltando: string[] } {
  const rep = cliente.representante ?? {};
  const end = cliente.endereco ?? {};
  const dados: Record<string, string> = {
    razao_social: cliente.razao_social ?? "",
    cnpj: cliente.cpf_cnpj ? formatarDocumento(cliente.cpf_cnpj) : "",
    endereco: enderecoLinha(cliente.endereco),
    cep: end.cep ? formatarCep(end.cep) : "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
    rep_nome: cliente.responsavel_nome ?? "",
    rep_nacionalidade: rep.nacionalidade ?? "",
    rep_estado_civil: rep.estado_civil ?? "",
    rep_profissao: rep.profissao ?? "",
    rep_rg: rep.rg ?? "",
    rep_cpf: rep.cpf ? formatarDocumento(rep.cpf) : "",
    honorario: honorarioMensal != null ? formatarMoeda(honorarioMensal) : "",
    honorario_extenso: honorarioMensal != null ? reaisPorExtenso(honorarioMensal) : "",
    vigencia_inicio: dataBR(vigenciaInicio),
  };
  const obrig: [string, string][] = [
    ["razao_social", "Razão social"],
    ["cnpj", "CNPJ"],
    ["endereco", "Endereço"],
    ["rep_nome", "Nome do representante"],
    ["rep_nacionalidade", "Nacionalidade"],
    ["rep_estado_civil", "Estado civil"],
    ["rep_profissao", "Profissão"],
    ["rep_rg", "RG do representante"],
    ["rep_cpf", "CPF do representante"],
    ["honorario", "Honorário"],
  ];
  const faltando = obrig.filter(([k]) => !dados[k]).map(([, label]) => label);
  return { dados, faltando };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/contrato/dados.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/contrato
git add src/lib/contrato/dados.ts src/tests/contrato/dados.test.ts
git commit -m "feat(contrato): montagem do mapa tag→valor + pré-checagem de campos"
```

---

## Task 4: Migration 0017 — representante do cliente

**Files:** Create `supabase/migrations/0017_clientes_representante.sql`.

**Interfaces:** Produces coluna `clientes.representante jsonb`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0017_clientes_representante.sql
-- Dados do representante legal para o contrato (V3). O NOME reaproveita
-- responsavel_nome já existente. Idempotente.
alter table clientes add column if not exists representante jsonb;
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: `0017_clientes_representante.sql` aplicada.

- [ ] **Step 3: Reaplicar é no-op**

Run: `npm run db:migrate`
Expected: 0 migrations novas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_clientes_representante.sql
git commit -m "feat(db): coluna representante (jsonb) em clientes (0017)"
```

---

## Task 5: Representante no cadastro (form + action + ficha)

**Files:** Modify `src/components/FormCliente.tsx`, `src/app/(app)/clientes/actions.ts`, `src/app/(app)/clientes/[id]/page.tsx`.

**Interfaces:** Consumes coluna `representante` (T4). O form grava campos planos `rep_nacionalidade/rep_estado_civil/rep_profissao/rep_rg/rep_cpf`; a action compõe o jsonb.

- [ ] **Step 1: Adicionar o fieldset ao `FormCliente.tsx`** — incluir `representante` em `ClienteDefaults` e o bloco de campos (após o fieldset "Contato"):

```tsx
// em ClienteDefaults, adicionar:
  representante?: Record<string, string> | null;
```

```tsx
// novo fieldset, após o fieldset "Contato" (antes de "Gestão interna"):
<fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
  <legend className="px-1 text-sm font-semibold text-slate-900">Representante legal (contrato)</legend>
  <div className="grid grid-cols-2 gap-3">
    <Campo label="Nacionalidade">
      <input name="rep_nacionalidade" defaultValue={(c.representante ?? {}).nacionalidade ?? ""} className={inputCls} />
    </Campo>
    <Campo label="Estado civil">
      <input name="rep_estado_civil" defaultValue={(c.representante ?? {}).estado_civil ?? ""} className={inputCls} />
    </Campo>
    <Campo label="Profissão">
      <input name="rep_profissao" defaultValue={(c.representante ?? {}).profissao ?? ""} className={inputCls} />
    </Campo>
    <Campo label="RG">
      <input name="rep_rg" defaultValue={(c.representante ?? {}).rg ?? ""} className={inputCls} />
    </Campo>
    <Campo label="CPF do representante">
      <input name="rep_cpf" defaultValue={(c.representante ?? {}).cpf ?? ""} className={inputCls} />
    </Campo>
  </div>
</fieldset>
```

- [ ] **Step 2: Compor o jsonb na action `clientes/actions.ts`** — adicionar helper espelhando `montarEndereco`:

```ts
// Monta o representante (jsonb) a partir dos campos planos do form.
function montarRepresentante(formData: FormData): Record<string, string> | null {
  const campos = ["nacionalidade", "estado_civil", "profissao", "rg", "cpf"];
  const r: Record<string, string> = {};
  let temAlgum = false;
  for (const c of campos) {
    const v = String(formData.get(`rep_${c}`) ?? "").trim().slice(0, 80);
    if (v) {
      r[c] = v;
      temAlgum = true;
    }
  }
  return temAlgum ? r : null;
}
```

E incluir `representante: montarRepresentante(formData)` no `.insert({...})` de `criarCliente` e no `.update({...})` de `atualizarCliente` (ao lado de `endereco: montarEndereco(formData)`).

- [ ] **Step 3: Carregar `representante` na ficha `clientes/[id]/page.tsx`** — adicionar `representante` à lista do `.select(...)` (linha do `select`), para o form exibir os valores atuais.

```
// no .select("... observacoes, atualizado_em") -> incluir "representante":
"id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, representante, contador_id, status, data_inicio, observacoes, atualizado_em"
```

- [ ] **Step 4: Verificar lint/types/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/FormCliente.tsx "src/app/(app)/clientes/actions.ts" "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(contrato): campos de representante legal no cadastro do cliente"
```

---

## Task 6: Template tagueado da minuta

**Files:** Create `templates/contrato-prestacao-servicos.docx`.

**Interfaces:** Produces o template versionado com as tags do §4 do spec.

- [ ] **Step 1: Produzir o template tagueado**

Abrir `~/crm-contratos/minuta contrato padrão.docx` no Word e substituir cada placeholder pelas tags (uma ocorrência por contexto), conforme o mapa do spec:
`{razao_social}`, `{cnpj}`, `{endereco}`, `{cep}`, `{email}`, `{telefone}`, `{rep_nome}`, `{rep_nacionalidade}`, `{rep_estado_civil}`, `{rep_profissao}`, `{rep_rg}`, `{rep_cpf}`, `{honorario}`, `{honorario_extenso}`, `{vigencia_inicio}`. Preencher o e-mail da CONTRATADA com o e-mail real do escritório (constante). Salvar como `templates/contrato-prestacao-servicos.docx` no repositório.

> Atenção docxtemplater: cada tag deve ficar **inteira num único trecho** (digite a tag de uma vez; não cole letra a letra) para o Word não fragmentar `{razao_social}` em runs.

- [ ] **Step 2: Verificar que todas as tags estão presentes** (script de checagem)

Run:
```bash
node --input-type=module -e '
import PizZip from "pizzip"; import { readFileSync } from "node:fs";
const xml = new PizZip(readFileSync("templates/contrato-prestacao-servicos.docx")).file("word/document.xml").asText();
const esperadas = ["razao_social","cnpj","endereco","cep","email","telefone","rep_nome","rep_nacionalidade","rep_estado_civil","rep_profissao","rep_rg","rep_cpf","honorario","honorario_extenso","vigencia_inicio"];
const faltando = esperadas.filter(t => !xml.includes("{"+t+"}"));
console.log(faltando.length ? "FALTAM TAGS: "+faltando.join(", ") : "OK: todas as tags presentes");
'
```
Expected: `OK: todas as tags presentes`.

- [ ] **Step 3: Commit**

```bash
git add templates/contrato-prestacao-servicos.docx
git commit -m "feat(contrato): minuta padrão tagueada (docxtemplater)"
```

---

## Task 7: Preenchimento do .docx (`gerarDocx`)

**Files:** Create `src/lib/contrato/gerar.ts`, `src/tests/contrato/gerar.test.ts`.

**Interfaces:** Produces `export function gerarDocx(template: Buffer, dados: Record<string,string>): Buffer`.

- [ ] **Step 1: Escrever o teste que falha** (usa um mini-docx fixture construído no próprio teste — não a minuta real)

```ts
// src/tests/contrato/gerar.test.ts
import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { gerarDocx } from "@/lib/contrato/gerar";

// Constrói um .docx mínimo válido com tags, em memória.
function miniDocx(corpo: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${corpo}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

function textoDe(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "");
}

describe("gerarDocx", () => {
  it("substitui as tags pelos valores", () => {
    const tpl = miniDocx("Cliente: {razao_social} - CNPJ {cnpj}");
    const out = gerarDocx(tpl, { razao_social: "ACME LTDA", cnpj: "11.222.333/0001-81" });
    expect(textoDe(out)).toBe("Cliente: ACME LTDA - CNPJ 11.222.333/0001-81");
  });
  it("tag sem valor no mapa vira vazio (nullGetter)", () => {
    const tpl = miniDocx("X{ausente}Y");
    expect(textoDe(gerarDocx(tpl, {}))).toBe("XY");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/contrato/gerar.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `gerarDocx` em `gerar.ts`**

```ts
// src/lib/contrato/gerar.ts
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// Preenche o template .docx com o mapa tag→valor, preservando a formatação.
// Tags ausentes no mapa viram string vazia (nullGetter).
export function gerarDocx(template: Buffer, dados: Record<string, string>): Buffer {
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/contrato/gerar.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/contrato
git add src/lib/contrato/gerar.ts src/tests/contrato/gerar.test.ts
git commit -m "feat(contrato): preenchimento do .docx via docxtemplater"
```

---

## Task 8: Conversão para PDF (`converterPdf` via Gotenberg)

**Files:** Modify `src/lib/contrato/gerar.ts`, `src/tests/contrato/gerar.test.ts`.

**Interfaces:** Produces `export async function converterPdf(docx: Buffer): Promise<Buffer | null>` (null quando `GOTENBERG_URL` ausente ou falha — degradação graciosa).

- [ ] **Step 1: Escrever o teste que falha** (mocka `fetch`)

```ts
// acrescentar a src/tests/contrato/gerar.test.ts
import { converterPdf } from "@/lib/contrato/gerar";
import { vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("converterPdf", () => {
  it("retorna null quando GOTENBERG_URL não está definida", async () => {
    vi.stubEnv("GOTENBERG_URL", "");
    expect(await converterPdf(Buffer.from("x"))).toBeNull();
  });
  it("POSTa ao Gotenberg e retorna o PDF", async () => {
    vi.stubEnv("GOTENBERG_URL", "http://gotenberg:3000");
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    vi.stubGlobal("fetch", vi.fn(async () => new Response(fakePdf, { status: 200 })));
    const out = await converterPdf(Buffer.from("docx"));
    expect(out).not.toBeNull();
    expect(out!.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("retorna null se o Gotenberg falhar", async () => {
    vi.stubEnv("GOTENBERG_URL", "http://gotenberg:3000");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 503 })));
    expect(await converterPdf(Buffer.from("docx"))).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/tests/contrato/gerar.test.ts`
Expected: FALHA (`converterPdf` inexistente).

- [ ] **Step 3: Implementar `converterPdf`** (acrescentar a `gerar.ts`)

```ts
// Converte .docx -> PDF via Gotenberg (/forms/libreoffice/convert). Retorna null
// (degradação graciosa) se a URL não estiver configurada ou a conversão falhar.
export async function converterPdf(docx: Buffer): Promise<Buffer | null> {
  const base = process.env.GOTENBERG_URL;
  if (!base) return null;
  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(docx)]), "contrato.docx");
    const resp = await fetch(`${base}/forms/libreoffice/convert`, { method: "POST", body: form });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/tests/contrato/gerar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck && npm test -- src/tests/contrato
git add src/lib/contrato/gerar.ts src/tests/contrato/gerar.test.ts
git commit -m "feat(contrato): conversão docx→PDF via Gotenberg (degradação graciosa)"
```

---

## Task 9: Server action `gerarContrato`

**Files:** Create `src/app/(app)/clientes/[id]/contrato.ts`.

**Interfaces:**
- Consumes: `montarDadosContrato` (T3), `gerarDocx`/`converterPdf` (T7/T8), `createServerSupabase`, `createAdminSupabase`, `getPerfilAtual`, `podeVerHonorario`.
- Produces: `type EstadoContrato = { erro?: string; ok?: boolean; avisos?: string[] }`; `export async function gerarContrato(clienteId: string, _prev: EstadoContrato, formData: FormData): Promise<EstadoContrato>`.

- [ ] **Step 1: Implementar a action** (sem teste unitário — lógica pura já testada em T3/T7/T8; coberta pela E2E da T12)

```ts
// src/app/(app)/clientes/[id]/contrato.ts
"use server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { montarDadosContrato, type ClienteContrato } from "@/lib/contrato/dados";
import { gerarDocx, converterPdf } from "@/lib/contrato/gerar";

export type EstadoContrato = { erro?: string; ok?: boolean; avisos?: string[] };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function gerarContrato(
  clienteId: string,
  _prev: EstadoContrato,
  formData: FormData,
): Promise<EstadoContrato> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeVerHonorario(perfil.papel)) return { erro: "Sem permissão para gerar contrato." };

  const vigencia = String(formData.get("vigencia_inicio") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) return { erro: "Informe a data de início da vigência." };

  const supabase = await createServerSupabase();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, endereco, email, telefone, responsavel_nome, representante")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado ou sem permissão." };

  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;

  const { dados, faltando } = montarDadosContrato(cliente as ClienteContrato, honorario, vigencia);

  let template: Buffer;
  try {
    template = readFileSync(join(process.cwd(), "templates", "contrato-prestacao-servicos.docx"));
  } catch {
    return { erro: "Modelo de contrato indisponível." };
  }

  let docx: Buffer;
  try {
    docx = gerarDocx(template, dados);
  } catch (e) {
    console.error("gerarContrato (docx):", e);
    return { erro: "Falha ao preencher o contrato." };
  }
  const pdf = await converterPdf(docx);

  const admin = createAdminSupabase();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseNome = `contrato-${stamp}`;
  const avisos: string[] = [];
  if (faltando.length) avisos.push(`Gerado com campos em branco: ${faltando.join(", ")}.`);

  const subir = async (buf: Buffer, ext: string, mime: string) => {
    const caminho = `${clienteId}/${baseNome}.${ext}`;
    const up = await admin.storage.from("documentos").upload(caminho, buf, { contentType: mime });
    if (up.error) return false;
    const { error } = await admin.from("documentos").insert({
      cliente_id: clienteId,
      nome: `${baseNome}.${ext}`,
      tipo: "Contrato",
      caminho_storage: caminho,
      enviado_por: perfil.id,
    });
    if (error) {
      await admin.storage.from("documentos").remove([caminho]);
      return false;
    }
    return true;
  };

  if (!(await subir(docx, "docx", DOCX_MIME))) return { erro: "Falha ao salvar o contrato (Word)." };
  if (pdf) {
    if (!(await subir(pdf, "pdf", "application/pdf"))) avisos.push("PDF gerado mas não salvo.");
  } else {
    avisos.push("PDF não gerado (serviço de conversão indisponível). Word salvo.");
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, avisos };
}
```

- [ ] **Step 2: Verificar lint/types/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/contrato.ts"
git commit -m "feat(contrato): action gerarContrato (gera, converte e salva nos Documentos)"
```

---

## Task 10: UI de geração na ficha

**Files:** Create `src/components/contrato/GerarContrato.tsx`; Modify `src/app/(app)/clientes/[id]/page.tsx`.

**Interfaces:** Consumes `gerarContrato` (T9). Render só para `podeVerHonorario`.

- [ ] **Step 1: Componente `GerarContrato.tsx`**

```tsx
// src/components/contrato/GerarContrato.tsx
"use client";
import { useActionState } from "react";
import { gerarContrato, type EstadoContrato } from "@/app/(app)/clientes/[id]/contrato";

export function GerarContrato({ clienteId, hoje }: { clienteId: string; hoje: string }) {
  const action = gerarContrato.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoContrato, FormData>(action, {});
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Gerar contrato</h2>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-700">Início da vigência</span>
          <input type="date" name="vigencia_inicio" defaultValue={hoje} required className="rounded border px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Gerando..." : "Gerar Word + PDF"}
        </button>
      </form>
      {estado.erro && <p role="alert" className="text-sm text-red-600">{estado.erro}</p>}
      {estado.ok && (
        <div role="status" className="text-sm text-green-700">
          Contrato gerado e salvo nos Documentos abaixo.
          {estado.avisos?.map((a) => (
            <span key={a} className="block text-amber-700">⚠️ {a}</span>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Renderizar na ficha `clientes/[id]/page.tsx`** — importar e exibir quando `mostrarHonorario` (mesma regra do honorário), passando a data de hoje. Adicionar antes de `<DocumentosSection .../>`:

```tsx
import { GerarContrato } from "@/components/contrato/GerarContrato";
// ...
// data de hoje em America/Sao_Paulo, formato YYYY-MM-DD para o <input type=date>
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
// ... no JSX, dentro do mostrarHonorario:
{mostrarHonorario && <GerarContrato clienteId={id} hoje={hoje} />}
```

- [ ] **Step 3: Verificar lint/types/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: verde; rota `/clientes/[id]` compila.

- [ ] **Step 4: Commit**

```bash
git add src/components/contrato/GerarContrato.tsx "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(contrato): UI de geração de contrato na ficha do cliente"
```

---

## Task 11: Gotenberg no deploy

**Files:** Modify `docs/DEPLOY.md`, `.env.local.example`.

- [ ] **Step 1: Documentar o serviço Gotenberg** — acrescentar a `docs/DEPLOY.md` uma seção: subir um serviço `gotenberg/gotenberg:8` no EasyPanel (porta 3000) e apontar `GOTENBERG_URL=http://gotenberg:3000` (rede interna). Sem ele, a geração entrega só o `.docx`.

- [ ] **Step 2: Registrar a env** — acrescentar `GOTENBERG_URL` a `.env.local.example` com comentário "URL interna do serviço Gotenberg (docx→pdf); vazio = só Word".

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY.md .env.local.example
git commit -m "docs(contrato): provisionar Gotenberg + GOTENBERG_URL no deploy"
```

---

## Task 12: Verificação E2E

**Files:** nenhuma (verificação).

- [ ] **Step 1: Subir o app** (`npm run dev`) e, opcionalmente, um Gotenberg local: `docker run --rm -p 3000:3000 gotenberg/gotenberg:8` com `GOTENBERG_URL=http://localhost:3000` no `.env.local`.

- [ ] **Step 2:** Logar como **admin**, abrir um cliente, preencher os campos de **Representante legal** e salvar.

- [ ] **Step 3:** Na seção **Gerar contrato**, escolher a data e clicar **Gerar Word + PDF**.
Expected: mensagem de sucesso; o `.docx` (e o `.pdf` se o Gotenberg estiver no ar) aparecem na seção **Documentos**.

- [ ] **Step 4:** Baixar o `.docx` e conferir que os dados do cliente (razão social, CNPJ, endereço, honorário por extenso, vigência) estão preenchidos corretamente na minuta.

- [ ] **Step 5:** Testar a degradação graciosa: sem `GOTENBERG_URL`, gerar de novo → aviso "PDF não gerado", Word salvo.

- [ ] **Step 6: Suíte completa**

Run: `npm run lint && npm run typecheck && npm test && npm run db:test`
Expected: tudo verde.

- [ ] **Step 7:** Atualizar `CHANGELOG.md` (V3) e abrir caminho para release `v3.0.0` (finishing-a-development-branch).

---

## Self-Review (resultado)

- **Cobertura do spec:** §4 placeholders → T3/T6; §5 representante → T4/T5; §6 motor → T1/T2/T3/T7/T8; §7 fluxo/UI → T9/T10; §8 erros (degradação PDF, template ausente, campos faltando) → T8/T9; §9 testes → T1/T2/T3/T7/T8 + T12; Gotenberg/infra → T11.
- **Placeholders:** sem TODO/TBD; código presente em cada passo. Passos que tocam arquivos existentes (FormCliente, actions, ficha) indicam a âncora exata.
- **Consistência de tipos:** `ClienteContrato` (T3) consumido em T9; `gerarDocx(Buffer, Record)`/`converterPdf(Buffer)` (T7/T8) consumidos em T9; `EstadoContrato` (T9) consumido em T10; coluna `representante` (T4) usada em T5/T9; `podeVerHonorario` reusado (não reimplementado).
- **Decisões do spec (§11):** lib `extenso` validada por teste comportamental (T1); tagueamento manual com verificação de tags (T6); Gotenberg com degradação graciosa (T8/T9/T11).
