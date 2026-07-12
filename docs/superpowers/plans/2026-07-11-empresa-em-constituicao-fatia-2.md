# Empresa em constituição — Fatia 2 (import do PDF) — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** No formulário "Nova empresa em constituição", permitir **upload do PDF do formulário Google**; extrair o texto, **pré-preencher** os campos e a lista de sócios (editável), e **anexar o PDF** ao acervo do cliente ao criar.

**Architecture:** `unpdf` extrai o texto (aplica ToUnicode). Parser puro casa **rótulo → resposta** e repete a seção de sócio. A extração pré-preenche o estado do `FormConstituicao` (que já existe); o usuário revisa antes de criar. O PDF vai para `documentos` ao criar o cliente.

## Global Constraints
- Server-only para `unpdf`/`createAdminSupabase`. `next/image`, alias `@/*`.
- **Não commitar** o PDF real nem dados de sócios reais (PII) — testes usam fixture sintético.
- Antes de commit: `npm run lint && npm run typecheck && npm test`.

---

### Task 1: Dependência unpdf + wrapper de extração de texto

**Files:**
- Modify: `package.json` (dep `unpdf`)
- Create: `src/lib/clientes/pdf-texto.ts`

- [ ] **Step 1: Instalar**

Run: `npm install unpdf`
Expected: adiciona `unpdf` às dependencies.

- [ ] **Step 2: Wrapper server-only** — `src/lib/clientes/pdf-texto.ts`:

```ts
import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

// Extrai o texto de um PDF (aplica ToUnicode das fontes). Junta as páginas com \n.
export async function extrairTextoPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}
```

- [ ] **Step 3: Dump local do PDF real (tuning; NÃO commitar a saída)**

Run (com o caminho do seu PDF):
```bash
node -e 'import("unpdf").then(async u=>{const fs=require("fs");const b=new Uint8Array(fs.readFileSync(process.argv[1]));const pdf=await u.getDocumentProxy(b);const {text}=await u.extractText(pdf,{mergePages:true});fs.writeFileSync("/private/tmp/claude-501/-Users-pedrogomes/f23f6524-f7b9-47dc-b5d0-85ec383cc817/scratchpad/form-dump.txt",Array.isArray(text)?text.join("\n"):text);console.log("ok")})' "/Users/pedrogomes/Downloads/Constituição de Empresa.pdf"
```
Ler o dump para afinar os rótulos-âncora do parser (Task 2). O arquivo fica no scratchpad, fora do repo.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sem erros (o wrapper compila).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/clientes/pdf-texto.ts
git commit -m "feat: unpdf + extração de texto de PDF (empresa em constituição)"
```

---

### Task 2: Parser do formulário (puro, TDD)

**Files:**
- Create: `src/lib/clientes/parser-constituicao.ts`
- Test: `src/tests/clientes/parser-constituicao.test.ts`

**Interfaces:**
- Consumes: `type SocioInput`, `type DadosConstituicao` de `@/lib/clientes/constituicao`.
- Produces: `extrairFormulario(texto: string): Partial<DadosConstituicao> & { sociosTexto?: string[] }` — melhor esforço; campos ausentes ficam indefinidos.

- [ ] **Step 1: Testes (falhando)** — `src/tests/clientes/parser-constituicao.test.ts`

Fixture sintético que imita o layout "rótulo\nResposta" do formulário (rótulos reais, dados fictícios):

```ts
import { describe, it, expect } from "vitest";
import { extrairFormulario } from "@/lib/clientes/parser-constituicao";

const TXT = [
  "Qual será a Razão Social (Nome) da sua empresa?",
  "Fictícia Comércio Ltda",
  "Qual será o Nome de Fantasia da sua empresa?",
  "Loja Fictícia",
  "Qual será o endereço completo (Logradouro, número, complemento, bairro, CEP, Cidade/UF) da sua empresa?",
  "Rua A, 100, Centro, 38400-000, Uberlândia/MG",
  "Descreva quais serão as atividades a serem desenvolvidas pela sua empresa:",
  "Comércio varejista de roupas",
  "Qual vai ser o valor do capital social da sua empresa?",
  "R$ 30.000,00",
  "CPF do(a) sócio(a):",
  "111.444.777-35",
  "Nome completo do(a) sócio(a):",
  "Ana Souza",
  "Esse sócio será apenas quotista ou também será administrador?",
  "Administrador",
  "Qual será o percentual de participação deste sócio no capital social da empresa?",
  "60%",
  "CPF do(a) sócio(a):",
  "222.333.444-05",
  "Nome completo do(a) sócio(a):",
  "Bruno Lima",
  "Esse sócio será apenas quotista ou também será administrador?",
  "Quotista",
  "Qual será o percentual de participação deste sócio no capital social da empresa?",
  "40%",
].join("\n");

describe("extrairFormulario", () => {
  it("extrai dados da empresa", () => {
    const d = extrairFormulario(TXT);
    expect(d.razaoSocial).toBe("Fictícia Comércio Ltda");
    expect(d.nomeFantasia).toBe("Loja Fictícia");
    expect(d.observacoes).toContain("Comércio varejista de roupas");
    expect(d.observacoes).toContain("30.000,00");
    expect(d.endereco?.cidade).toBe("Uberlândia");
    expect(d.endereco?.uf).toBe("MG");
  });
  it("extrai a lista de sócios com papel e participação", () => {
    const d = extrairFormulario(TXT);
    expect(d.socios).toHaveLength(2);
    expect(d.socios?.[0]).toMatchObject({ nome: "Ana Souza", papelSocietario: "administrador", participacao: "60%" });
    expect(d.socios?.[1]).toMatchObject({ nome: "Bruno Lima", papelSocietario: "quotista", participacao: "40%" });
  });
});
```

- [ ] **Step 2:** `npm test -- parser-constituicao` → FAIL.

- [ ] **Step 3: Implementar `parser-constituicao.ts`**

Estratégia: lista **ordenada** de rótulos-âncora; a resposta de cada rótulo é o texto entre ele e o próximo rótulo conhecido. Para sócios, repetir a partir de cada "CPF do(a) sócio(a):". Rótulos reais confirmados no dump (Task 1). Estrutura:

```ts
import type { SocioInput, DadosConstituicao } from "@/lib/clientes/constituicao";

// Rótulos-âncora (substrings estáveis do formulário). Ordem NÃO importa para o corte
// por rótulo; usa-se a posição de cada rótulo no texto.
const L = {
  razao: "Razão Social",
  fantasia: "Nome de Fantasia",
  enderecoEmpresa: "endereço completo",   // 1ª ocorrência = empresa
  atividades: "atividades a serem desenvolvidas",
  capital: "valor do capital social",
  socioCpf: "CPF do(a) sócio(a)",
  socioNome: "Nome completo do(a) sócio(a)",
  socioPapel: "quotista ou também será administrador",
  socioPart: "percentual de participação",
};

function respostaApos(texto: string, rotulo: string, deInicio = 0): { valor: string; fim: number } | null {
  const i = texto.indexOf(rotulo, deInicio);
  if (i < 0) return null;
  const aposRotulo = texto.indexOf("\n", i);
  const inicio = aposRotulo < 0 ? i + rotulo.length : aposRotulo + 1;
  // resposta = até a próxima linha que aparente ser um rótulo (contém "?" ou ":" de pergunta) — heurística simples: próxima linha não vazia
  const resto = texto.slice(inicio);
  const linha = resto.split("\n").find((l) => l.trim().length > 0) ?? "";
  return { valor: linha.trim(), fim: inicio };
}

function parseEndereco(s: string): Record<string, string> | null {
  // "Rua A, 100, Centro, 38400-000, Uberlândia/MG" -> heurística por vírgulas + CEP + UF
  if (!s) return null;
  const partes = s.split(",").map((x) => x.trim()).filter(Boolean);
  const e: Record<string, string> = {};
  const cepIdx = partes.findIndex((p) => /\d{5}-?\d{3}/.test(p));
  if (cepIdx >= 0) e.cep = (partes[cepIdx].match(/\d{5}-?\d{3}/)?.[0]) ?? "";
  const cidadeUf = partes.find((p) => /\/[A-Z]{2}\b/.test(p));
  if (cidadeUf) { const [cid, uf] = cidadeUf.split("/"); e.cidade = cid.trim(); e.uf = (uf ?? "").trim().slice(0, 2); }
  if (partes[0]) e.logradouro = partes[0];
  if (partes[1]) e.numero = partes[1];
  return Object.keys(e).length ? e : null;
}

export function extrairFormulario(texto: string): Partial<DadosConstituicao> {
  const t = texto.replace(/\r/g, "");
  const val = (rot: string) => respostaApos(t, rot)?.valor ?? null;

  const razaoSocial = val(L.razao) ?? undefined;
  const nomeFantasia = val(L.fantasia) ?? null;
  const enderecoEmpresa = val(L.enderecoEmpresa) ?? "";
  const atividades = val(L.atividades) ?? "";
  const capital = val(L.capital) ?? "";
  const observacoes = [atividades, capital && `Capital social: ${capital}`].filter(Boolean).join(" · ") || null;

  // sócios: itera sobre cada ocorrência de "CPF do(a) sócio(a)"
  const socios: SocioInput[] = [];
  let pos = 0;
  while (true) {
    const iCpf = t.indexOf(L.socioCpf, pos);
    if (iCpf < 0) break;
    const cpf = respostaApos(t, L.socioCpf, iCpf)?.valor ?? null;
    const nome = respostaApos(t, L.socioNome, iCpf)?.valor ?? "";
    const papelRaw = (respostaApos(t, L.socioPapel, iCpf)?.valor ?? "").toLowerCase();
    const papelSocietario = papelRaw.includes("administrador") ? "administrador" : papelRaw.includes("quotista") ? "quotista" : null;
    const participacao = respostaApos(t, L.socioPart, iCpf)?.valor ?? null;
    if (nome.trim()) socios.push({ nome: nome.trim(), cpf: cpf ? cpf.replace(/\D/g, "") || null : null, participacao, papelSocietario });
    pos = iCpf + L.socioCpf.length;
  }

  return {
    razaoSocial,
    nomeFantasia,
    endereco: parseEndereco(enderecoEmpresa),
    observacoes,
    socios,
  };
}
```

- [ ] **Step 4:** `npm test -- parser-constituicao` → PASS. **Validar contra o dump real** (Task 1): rodar um node rápido que passa o `form-dump.txt` por `extrairFormulario` e conferir os campos — ajustar os rótulos-âncora se algum vier vazio. (Sem commit do dump.)

- [ ] **Step 5:** `npm run typecheck && npm run lint`.

- [ ] **Step 6:** Commit `feat: parser do formulário de constituição (rótulo→resposta + sócios)`

---

### Task 3: Ação de import + upload no formulário

**Files:**
- Create: `src/app/(app)/clientes/importar-constituicao-actions.ts`
- Modify: `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx`

**Interfaces:**
- `importarFormularioPdf(formData: FormData): Promise<{ dados?: DadosImport; erro?: string }>` onde `DadosImport = { razaoSocial?: string; nomeFantasia?: string|null; endereco?: Record<string,string>|null; observacoes?: string|null; socios?: {nome:string;cpf:string|null;participacao:string|null;papelSocietario:"administrador"|"quotista"|null}[] }`.

- [ ] **Step 1: Action** — `importar-constituicao-actions.ts`:

```ts
"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { extrairTextoPdf } from "@/lib/clientes/pdf-texto";
import { extrairFormulario } from "@/lib/clientes/parser-constituicao";

export async function importarFormularioPdf(formData: FormData): Promise<{ dados?: ReturnType<typeof extrairFormulario>; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const arquivo = formData.get("pdf") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione o PDF do formulário." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "PDF acima de 10 MB." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return { erro: "Envie um arquivo PDF." };
  let texto: string;
  try { texto = await extrairTextoPdf(bytes); } catch { return { erro: "Não consegui ler o PDF (pode ser uma imagem escaneada)." }; }
  const dados = extrairFormulario(texto);
  if (!dados.razaoSocial && (!dados.socios || dados.socios.length === 0)) return { erro: "Não reconheci os campos do formulário neste PDF." };
  return { dados };
}
```

- [ ] **Step 2: Upload no `FormConstituicao`** — adicionar no topo um bloco "Importar do formulário (PDF)": `<input type="file" accept="application/pdf">` + botão "Importar". Ao clicar, monta um FormData e chama `importarFormularioPdf`; com `dados`, **pré-preenche** os estados do formulário (razão social, nome fantasia, endereço, observações e a lista de sócios). Como os campos da empresa hoje são inputs não-controlados (`name`), converter os principais para **controlados** (useState) para permitir o pré-preenchimento, OU usar `defaultValue` + `key` para forçar re-render. Preferir estados controlados para razão social, nome fantasia, endereço (campos), observações; sócios já são estado. Guardar também o `File` do PDF selecionado num estado `pdfFile` para anexar na criação (Task 4).

- [ ] **Step 3:** `npm run lint && npm run typecheck`.
- [ ] **Step 4:** Commit `feat: importar PDF do formulário e pré-preencher o cadastro de constituição`

---

### Task 4: Anexar o PDF ao acervo na criação

**Files:**
- Modify: `src/app/(app)/clientes/constituicao-actions.ts` (aceitar o PDF e registrar em `documentos`)
- Modify: `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx` (enviar o PDF no submit)

- [ ] **Step 1: Anexo em `criarEmpresaConstituicao`** — após inserir o cliente com sucesso, se houver `formData.get("pdf")` (File PDF válido, ≤10 MB), fazer upload em `documentos` `${clienteId}/${crypto.randomUUID()}-formulario.pdf` e inserir a linha em `documentos` (nome "Formulário de constituição", tipo "constituição", enviado_por = perfil.id). Falha no anexo **não** aborta a criação (loga e segue) — o cliente já foi criado.

```ts
// dentro de criarEmpresaConstituicao, após obter clienteId:
const pdf = formData.get("pdf");
if (pdf instanceof File && pdf.size > 0 && pdf.size <= 10 * 1024 * 1024) {
  const admin = createAdminSupabase();
  const caminho = `${clienteId}/${crypto.randomUUID()}-formulario.pdf`;
  const up = await admin.storage.from("documentos").upload(caminho, pdf, { contentType: "application/pdf" });
  if (!up.error) {
    await admin.from("documentos").insert({ cliente_id: clienteId, nome: "Formulário de constituição", tipo: "constituição", caminho_storage: caminho, enviado_por: perfil.id });
  }
}
```

(import de `createAdminSupabase`.)

- [ ] **Step 2: Enviar o PDF no submit** — no `FormConstituicao.enviar`, se `pdfFile` existir, `fd.set("pdf", pdfFile)` antes de chamar `criarEmpresaConstituicao`.

- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test`.
- [ ] **Step 4:** Commit `feat: anexa o PDF do formulário ao acervo do cliente em constituição`

---

### Task 5: Documentação

- [ ] **Step 1:** Em `docs/DOCUMENTACAO.md` (seção Clientes → empresa em constituição): registrar o **import do PDF** — upload do formulário Google, extração via `unpdf`, pré-preenchimento revisável do cadastro e dos sócios, e anexo do PDF ao acervo. Observar que é parser determinístico por rótulo (sensível a mudanças no formulário) e que PDFs escaneados (imagem) não são lidos.
- [ ] **Step 2:** Commit `docs: import do PDF do formulário de constituição`

---

## Self-Review
- Extração de texto (unpdf) → T1. ✔
- Parser rótulo→resposta + sócios → T2 (tunado no dump real; testado em fixture sintético). ✔
- Import + pré-preenchimento → T3. ✔
- Anexo do PDF ao acervo → T4. ✔
- Docs → T5. ✔
- **Sem PII no repo:** dump real e PDF ficam fora do git; testes usam fixture fictício.
