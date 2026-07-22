# Alterar vencimento do boleto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alterar o vencimento de um boleto emitido em uma ação/um clique (cancela + reemite com a nova data), sem alterar o título e sem reenvio automático ao cliente.

**Architecture:** Uma server action `alterarVencimentoBoleto(boletoId, novaData)` orquestra: valida a data (helper puro) → cancela o boleto atual no provedor → reemite com a nova data reusando um núcleo de emissão extraído de `emitirBoleto`. Só o boleto muda; o título fica intocado. Sem migration.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase · Vitest.

## Global Constraints

- **Só o boleto muda** — o `titulo.vencimento` NÃO é alterado (decisão do spec). Efeito colateral aceito: cobrança/inadimplência/relatórios seguem a data do título.
- **Mecanismo cancelar → reemitir**, nessa ordem (nunca dois boletos ativos). Falha na reemissão após o cancelamento deixa o título sem boleto ativo, retryável via "Emitir boleto" — reportar com clareza.
- **Reenvio manual** — a ação só gera o boleto novo e atualiza a tela.
- **Provedor:** Inter completo. Asaas herda a limitação **pré-existente** de não propagar o cancelamento (não pioro nem conserto). Produção usa Inter.
- **Sem migration.** Reusa a tabela `boleto`.
- **Inputs:** usar `controleCls()` do projeto, nunca classes de borda coladas (guard `divida-ui`).
- **Data determinística nos testes:** o helper puro recebe `hojeISO` por parâmetro (nada de `new Date()` dentro do que é testado).
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** trabalhar em `develop`; entrega por PR para `main` com `verify` verde. **Esta release inclui também o fix da faixa da sidebar já commitado** (`fix(ui): sidebar rola e fixa…`).

**Fatos verificados no repo:**
- `emitirBoleto`/`cancelarBoleto`/`listarBoletosDaCompetencia`/`BoletoView` vivem em `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`.
- `cancelarBoletoNoInter(admin, {id, provedor, provedor_boleto_id, status}, motivo)` em `src/lib/boleto/cancelar-exec.ts` — cancela no Inter (quando `provedor==='inter'`) e marca `status='cancelado'`.
- `dadosEmissaoDeTitulo({valor, vencimento, descricao}, cliente, numero)` em `src/lib/boleto/emissao.ts`.
- `adaptadorAtivo()` retorna `{ provedor, adaptador }` ou `{ erro }`.
- `BoletoTitulo.tsx` usa botões de texto sublinhado; padrão de erro = `alert`, sucesso = `onMudou()`.
- Fixtures de teste que constroem `BoletoView` e vão precisar do novo campo `vencimento`: `src/tests/financeiro/cancelar-boleto-render.test.tsx`, `src/tests/financeiro/boleto-titulo-pdf.test.tsx`, `src/tests/financeiro/boleto-titulo-render.test.tsx`.

---

## File Structure

- `src/lib/boleto/vencimento.ts` (Create) — `validarNovaVencimento` (puro).
- `src/tests/boleto/vencimento.test.ts` (Create) — testes do validador.
- `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` (Modify) — extrair `emitirBoletoNucleo`; nova action `alterarVencimentoBoleto`; `BoletoView.vencimento`; `select` com `vencimento`.
- `src/components/financeiro/BoletoTitulo.tsx` (Modify) — botão "Alterar vencimento" + campo de data inline.
- `src/tests/financeiro/cancelar-boleto-render.test.tsx` (Modify) — fixture ganha `vencimento`.
- `src/tests/financeiro/boleto-titulo-pdf.test.tsx` (Modify) — fixture ganha `vencimento`.
- `src/tests/financeiro/boleto-titulo-render.test.tsx` (Modify) — fixture ganha `vencimento`.
- `src/tests/financeiro/alterar-vencimento-render.test.tsx` (Create) — botão aparece só com `emitido`.

**Ordem:** validador → refactor do núcleo → action → UI → release.

---

### Task 1: Validador puro da nova data

**Files:**
- Create: `src/lib/boleto/vencimento.ts`
- Test: `src/tests/boleto/vencimento.test.ts`

**Interfaces:**
- Produces: `validarNovaVencimento(novaData: string, vencimentoAtual: string, hojeISO: string): { ok: true } | { erro: string }` — todos em `YYYY-MM-DD`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/tests/boleto/vencimento.test.ts
import { describe, it, expect } from "vitest";
import { validarNovaVencimento } from "@/lib/boleto/vencimento";

const HOJE = "2026-07-22";

describe("validarNovaVencimento", () => {
  it("aceita data futura diferente da atual", () => {
    expect(validarNovaVencimento("2026-08-10", "2026-07-30", HOJE)).toEqual({ ok: true });
  });

  it("aceita a própria data de hoje", () => {
    expect(validarNovaVencimento(HOJE, "2026-07-30", HOJE)).toEqual({ ok: true });
  });

  it("rejeita data anterior a hoje", () => {
    expect(validarNovaVencimento("2026-07-21", "2026-07-30", HOJE)).toEqual({
      erro: "A nova data não pode ser anterior a hoje.",
    });
  });

  it("rejeita data igual à atual", () => {
    expect(validarNovaVencimento("2026-07-30", "2026-07-30", HOJE)).toEqual({
      erro: "A nova data é igual à atual.",
    });
  });

  it("rejeita formato inválido", () => {
    expect(validarNovaVencimento("30/07/2026", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
    expect(validarNovaVencimento("2026-7-3", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
  });

  it("rejeita data inexistente no calendário", () => {
    expect(validarNovaVencimento("2026-13-40", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
    expect(validarNovaVencimento("2026-02-30", "2026-07-30", HOJE)).toEqual({ erro: "Data inválida." });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/boleto/vencimento.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/boleto/vencimento"`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/boleto/vencimento.ts

// Valida a nova data de vencimento de um boleto (formato YYYY-MM-DD). Puro e determinístico:
// recebe `hojeISO` por parâmetro. Regras: formato + data real; ≥ hoje; ≠ vencimento atual.
export function validarNovaVencimento(
  novaData: string,
  vencimentoAtual: string,
  hojeISO: string,
): { ok: true } | { erro: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { erro: "Data inválida." };
  // Data precisa existir no calendário: o round-trip por Date pega 2026-02-30, 2026-13-40 etc.
  const d = new Date(`${novaData}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== novaData) return { erro: "Data inválida." };
  // Comparação lexicográfica de datas ISO equivale à cronológica.
  if (novaData < hojeISO) return { erro: "A nova data não pode ser anterior a hoje." };
  if (novaData === vencimentoAtual) return { erro: "A nova data é igual à atual." };
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/boleto/vencimento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boleto/vencimento.ts src/tests/boleto/vencimento.test.ts
git commit -m "feat(boleto): validador puro da nova data de vencimento"
```

---

### Task 2: Extrair `emitirBoletoNucleo` (refactor sem mudança de comportamento)

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Produces: `emitirBoletoNucleo(supabase, titulo, vencimento)` (interna, não exportada) reutilizável por `emitirBoleto` e (Task 3) `alterarVencimentoBoleto`.
- `emitirBoleto` mantém a mesma assinatura e comportamento.

Refactor puro: nenhum teste novo. Rede de segurança = typecheck + build + os testes de boleto existentes (nenhum exercita `emitirBoleto` diretamente, então o ganho é não quebrar tipos/compilação).

- [ ] **Step 1: Adicionar o núcleo e reescrever `emitirBoleto` como wrapper**

Substituir a função `emitirBoleto` inteira (do `export async function emitirBoleto` até o `}` que fecha, antes de `urlBoletoPdfEquipe`) por:

```ts
// Núcleo de emissão reutilizável: recebe o título já carregado + a data de vencimento a usar
// (a do próprio título na emissão normal; a nova data na alteração de vencimento). Carrega o
// cliente, pega o próximo número, emite no provedor ativo e grava a linha `boleto`. NÃO faz gate
// nem checagem de duplicidade — isso é responsabilidade de quem chama.
async function emitirBoletoNucleo(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  titulo: { id: string; valor: number; descricao: string | null; cliente_id: string },
  vencimento: string,
): Promise<{ ok?: true; erro?: string }> {
  const { data: c } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, email, endereco")
    .eq("id", titulo.cliente_id)
    .maybeSingle();
  if (!c) return { erro: "Cliente não encontrado." };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { data: n } = await supabase.rpc("proximo_numero_boleto");
  const numero = Number(n);
  const dados = dadosEmissaoDeTitulo(
    { valor: Number(titulo.valor), vencimento, descricao: titulo.descricao },
    {
      razaoSocial: c.razao_social as string,
      cpfCnpj: (c.cpf_cnpj as string) ?? "",
      email: (c.email as string | null) ?? null,
      endereco: (c.endereco as Record<string, string> | null) ?? null,
    },
    numero,
  );
  let emitido;
  try {
    emitido = await ativo.adaptador.emitir(dados);
  } catch (e) {
    return { erro: `Falha na emissão: ${(e as Error).message}` };
  }
  const { error } = await supabase.from("boleto").insert({
    titulo_id: titulo.id,
    numero,
    provedor: ativo.provedor,
    provedor_boleto_id: emitido.provedorBoletoId,
    nosso_numero: emitido.nossoNumero,
    linha_digitavel: emitido.linhaDigitavel,
    pix_copia_cola: emitido.pixCopiaCola,
    url_pdf: emitido.urlPdf,
    valor: titulo.valor,
    vencimento,
  });
  if (error) return { erro: "Boleto emitido no provedor, mas falhou ao gravar. Verifique antes de reemitir." };
  return { ok: true };
}

export async function emitirBoleto(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("titulo")
    .select("id, valor, vencimento, descricao, status, cliente_id")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  if (t.status !== "ABERTO" && t.status !== "VENCIDO") return { erro: "Título não está em aberto." };
  const { data: existente } = await supabase
    .from("boleto")
    .select("id")
    .eq("titulo_id", tituloId)
    .not("status", "in", "(cancelado,erro)")
    .maybeSingle();
  if (existente) return { erro: "Já existe boleto para este título." };
  const r = await emitirBoletoNucleo(
    supabase,
    {
      id: t.id as string,
      valor: Number(t.valor),
      descricao: (t.descricao as string | null) ?? null,
      cliente_id: t.cliente_id as string,
    },
    t.vencimento as string,
  );
  if (r.erro) return r;
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" && npm run build`
Expected: sem erros. Se `Awaited<ReturnType<typeof createServerSupabase>>` reclamar, confirmar que `createServerSupabase` é `async` (é — usada com `await` no arquivo).

- [ ] **Step 3: Rodar os testes de boleto (não regrediram)**

Run: `npx vitest run src/tests/boleto src/tests/financeiro`
Expected: PASS (mesmo conjunto de antes).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "refactor(boleto): extrai emitirBoletoNucleo de emitirBoleto"
```

---

### Task 3: Action `alterarVencimentoBoleto`

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `validarNovaVencimento` (Task 1); `emitirBoletoNucleo` (Task 2); `cancelarBoletoNoInter`; `createAdminSupabase` (já importado).
- Produces: `alterarVencimentoBoleto(boletoId: string, novaData: string): Promise<{ ok?: boolean; erro?: string }>`.

Sem teste unitário de action (o repo não tem harness de mock de Supabase para as actions de boleto — `emitirBoleto`/`cancelarBoleto` também não têm). Cobertura: o validador puro (Task 1) + typecheck/build + smoke manual. A lógica de I/O reusa blocos já existentes.

- [ ] **Step 1: Importar o validador**

No topo de `boleto-actions.ts`, adicionar:

```ts
import { validarNovaVencimento } from "@/lib/boleto/vencimento";
```

- [ ] **Step 2: Adicionar a action (ao final do arquivo)**

```ts
// Altera o vencimento de um boleto emitido: cancela o atual no provedor e reemite com a nova data.
// Só o boleto muda — o título fica intocado. Ordem cancelar→reemitir para nunca haver dois boletos
// ativos. Se a reemissão falhar após o cancelamento, o título fica sem boleto ativo (retryável).
export async function alterarVencimentoBoleto(
  boletoId: string,
  novaData: string,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  const { data: b } = await supabase
    .from("boleto")
    .select("id, titulo_id, provedor, provedor_boleto_id, vencimento, status")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  if (b.status !== "emitido") return { erro: "Só é possível alterar o vencimento de boleto emitido." };

  const hojeISO = new Date().toISOString().slice(0, 10);
  const val = validarNovaVencimento(novaData, b.vencimento as string, hojeISO);
  if ("erro" in val) return { erro: val.erro };

  const { data: t } = await supabase
    .from("titulo")
    .select("id, valor, descricao, status, cliente_id")
    .eq("id", b.titulo_id as string)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  if (t.status !== "ABERTO" && t.status !== "VENCIDO") return { erro: "Título não está em aberto." };

  // Cancela a antiga ANTES de reemitir. Motivo ≤ 50 chars (limite do Inter).
  const motivo = `Alteração de vencimento para ${novaData.slice(8, 10)}/${novaData.slice(5, 7)}/${novaData.slice(0, 4)}`;
  try {
    await cancelarBoletoNoInter(
      admin,
      {
        id: b.id as string,
        provedor: b.provedor as string,
        provedor_boleto_id: (b.provedor_boleto_id as string | null) ?? null,
        status: b.status as string,
      },
      motivo,
    );
  } catch (e) {
    return { erro: `Falha ao cancelar no provedor: ${(e as Error).message}` };
  }

  const r = await emitirBoletoNucleo(
    supabase,
    {
      id: t.id as string,
      valor: Number(t.valor),
      descricao: (t.descricao as string | null) ?? null,
      cliente_id: t.cliente_id as string,
    },
    novaData,
  );
  if (r.erro) {
    return { erro: `Boleto cancelado, mas a reemissão falhou: ${r.erro} Use "Emitir boleto" para gerar novamente.` };
  }
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
```

- [ ] **Step 3: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(boleto): action alterarVencimentoBoleto (cancela + reemite com nova data)"
```

---

### Task 4: `BoletoView.vencimento` + botão na UI

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`
- Modify: `src/components/financeiro/BoletoTitulo.tsx`
- Modify: `src/tests/financeiro/cancelar-boleto-render.test.tsx`
- Modify: `src/tests/financeiro/boleto-titulo-pdf.test.tsx`
- Modify: `src/tests/financeiro/boleto-titulo-render.test.tsx`
- Create: `src/tests/financeiro/alterar-vencimento-render.test.tsx`

**Interfaces:**
- Consumes: `alterarVencimentoBoleto` (Task 3); `controleCls` (`@/components/ui/Campo`).
- `BoletoView` ganha `vencimento: string`.

- [ ] **Step 1: `BoletoView.vencimento` + `select`/map em `listarBoletosDaCompetencia`**

Em `boleto-actions.ts`, no tipo `BoletoView`, adicionar após `numero: number;`:

```ts
  vencimento: string;
```

No `select` de `listarBoletosDaCompetencia`, incluir `vencimento`:

```ts
    .select("id, titulo_id, numero, provedor, vencimento, linha_digitavel, pix_copia_cola, url_pdf, status")
```

No objeto montado dentro do `for`, adicionar após `numero: Number(b.numero),`:

```ts
      vencimento: b.vencimento as string,
```

- [ ] **Step 2: Botão + campo de data no `BoletoTitulo`**

Em `src/components/financeiro/BoletoTitulo.tsx`:

Trocar o import das actions para incluir `alterarVencimentoBoleto`, e adicionar o import de `controleCls`:

```tsx
import {
  emitirBoleto,
  urlBoletoPdfEquipe,
  cancelarBoleto,
  alterarVencimentoBoleto,
  type BoletoView,
} from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { controleCls } from "@/components/ui/Campo";
```

Adicionar estado e handler (logo após `const [ocupado, setOcupado] = useState(false);`):

```tsx
  const [editandoVenc, setEditandoVenc] = useState(false);
  const [novaData, setNovaData] = useState("");
  async function salvarVencimento() {
    const r = await alterarVencimentoBoleto(boleto!.id, novaData);
    if (r.erro) return alert(r.erro);
    setEditandoVenc(false);
    onMudou();
  }
```

Trocar o bloco final do `status === "emitido"`:

```tsx
      {boleto.status === "emitido" && (
        <button type="button" onClick={cancelar} className="block text-left text-negativo underline">
          Cancelar boleto
        </button>
      )}
```

por:

```tsx
      {boleto.status === "emitido" && (
        <>
          {editandoVenc ? (
            <span className="flex flex-wrap items-center gap-1">
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                aria-label="Nova data de vencimento"
                className={`${controleCls("compacto")} text-[11px]`}
              />
              <button type="button" onClick={salvarVencimento} className="underline">
                Confirmar
              </button>
              <button type="button" onClick={() => setEditandoVenc(false)} className="text-cinza-claro underline">
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNovaData(boleto.vencimento);
                setEditandoVenc(true);
              }}
              className="block text-left underline"
            >
              Alterar vencimento
            </button>
          )}
          <button type="button" onClick={cancelar} className="block text-left text-negativo underline">
            Cancelar boleto
          </button>
        </>
      )}
```

- [ ] **Step 3: Atualizar as três fixtures existentes (novo campo obrigatório)**

Em `src/tests/financeiro/cancelar-boleto-render.test.tsx`, na linha `const base = {...}`, adicionar `vencimento: "2026-08-10",`:

```tsx
const base = { id: "b1", numero: 7, provedor: "inter", vencimento: "2026-08-10", linhaDigitavel: "0001", pixCopiaCola: null, urlPdf: null };
```

Em `src/tests/financeiro/boleto-titulo-pdf.test.tsx`, idem na linha `const base = {...}`:

```tsx
const base = { id: "b1", numero: 7, provedor: "inter", vencimento: "2026-08-10", linhaDigitavel: "0001", pixCopiaCola: null, status: "emitido" };
```

Em `src/tests/financeiro/boleto-titulo-render.test.tsx`, no objeto `boleto` passado ao componente, adicionar `vencimento: "2026-08-10",` junto dos demais campos (ao lado de `numero`/`provedor`).

- [ ] **Step 4: Novo render test do botão**

```tsx
// src/tests/financeiro/alterar-vencimento-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";

const base = {
  id: "b1",
  numero: 7,
  provedor: "inter",
  vencimento: "2026-08-10",
  linhaDigitavel: "0001",
  pixCopiaCola: null,
  urlPdf: null,
};

describe("BoletoTitulo — alterar vencimento", () => {
  it("boleto emitido mostra 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "emitido" }} onMudou={() => {}} />,
    );
    expect(html).toContain("Alterar vencimento");
  });

  it("boleto pago não mostra 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <BoletoTitulo tituloId="t1" boleto={{ ...base, status: "pago" }} onMudou={() => {}} />,
    );
    expect(html).not.toContain("Alterar vencimento");
  });
});
```

- [ ] **Step 5: Verificar (typecheck + lint + testes + build)**

Run: `npm run typecheck && npx eslint "src/components/financeiro/BoletoTitulo.tsx" "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" && npx vitest run src/tests/financeiro src/tests/boleto && npm run build`
Expected: sem erros; render tests (incluindo o novo e os três com fixture atualizada) passam.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" src/components/financeiro/BoletoTitulo.tsx src/tests/financeiro/cancelar-boleto-render.test.tsx src/tests/financeiro/boleto-titulo-pdf.test.tsx src/tests/financeiro/boleto-titulo-render.test.tsx src/tests/financeiro/alterar-vencimento-render.test.tsx
git commit -m "feat(boleto): botao Alterar vencimento no BoletoTitulo + vencimento na BoletoView"
```

---

### Task 5: Release 6.67.0 (com o fix da sidebar)

**Files:**
- Modify: `package.json` (version)
- Modify: `CHANGELOG.md`

Produção está em 6.66.0. Esta release junta **duas** mudanças já em `develop`: o fix da faixa da sidebar (`fix(ui): sidebar rola e fixa…`) e a feature de alterar vencimento. Sem migration.

- [ ] **Step 1: Barra de qualidade completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: tudo verde. (Se `format:check` falhar, `npm run format` e recommitar.)

- [ ] **Step 2: Bump de versão (sem tag) — incluir o lockfile**

Run: `npm version minor --no-git-tag-version`
Expected: `package.json` → `6.67.0`. Incluir `package-lock.json` no commit da release.

- [ ] **Step 3: Entrada no CHANGELOG (topo, acima de 6.66.0)**

```markdown
## [6.67.0] — 2026-07-22

### Adicionado

- **Alterar vencimento do boleto.** Boleto emitido ganhou a ação "Alterar vencimento": em um clique,
  o sistema cancela o boleto atual no provedor e reemite com a nova data (nova linha digitável). Só o
  boleto muda — o título e a régua de cobrança seguem a data original. O reenvio ao cliente continua
  manual.

### Corrigido

- **Faixa da barra lateral.** Com o menu mais alto que a tela, "Configurações", "Segurança (2FA)" e
  "Sair" ficavam fora da faixa escura. A barra passa a rolar internamente e a acompanhar a página.
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.67.0 — alterar vencimento do boleto + fix da faixa da sidebar"
```

- [ ] **Step 6: Finalizar a branch (PR)**

Seguir **superpowers:finishing-a-development-branch** → "Push and create a Pull Request":
`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` ("todos concluídos") → PR verde. **Não** mergear sem autorização explícita do usuário. Após merge (autorizado): sem migration → Implantar no EasyPanel → confirmar `/api/health` = `6.67.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec:**
- Ação única alterar vencimento (cancelar → reemitir, só o boleto) → Task 3. ✅
- Validações (status emitido, data ≥ hoje, ≠ atual) → Task 1 (puro) + Task 3 (gate de status). ✅
- Refactor `emitirBoletoNucleo` reusado por emitir e reemitir → Task 2. ✅
- `BoletoView.vencimento` + botão "Alterar vencimento" com campo de data → Task 4. ✅
- Sem migration; reenvio manual; Asaas fora de escopo → refletido nas Global Constraints. ✅
- Entrega junto do fix da sidebar em uma release → Task 5. ✅

**2. Placeholders:** nenhum — todo passo traz o código completo.

**3. Consistência de tipos:** `emitirBoletoNucleo(supabase, {id,valor,descricao,cliente_id}, vencimento)` é chamado com a mesma forma em `emitirBoleto` (Task 2) e `alterarVencimentoBoleto` (Task 3). `validarNovaVencimento(novaData, vencimentoAtual, hojeISO)` idem entre Task 1 e Task 3. `BoletoView.vencimento: string` (Task 4) — as três fixtures existentes recebem o campo no mesmo passo, evitando quebra de typecheck.

**Nota de execução:** as actions de boleto não têm harness de teste com mock de Supabase no repo (nem `emitirBoleto`/`cancelarBoleto` têm) — por isso a cobertura automatizada fica no validador puro + render; o caminho de I/O é validado por typecheck/build + smoke manual (emitir → alterar vencimento → conferir novo boleto com a data nova e o antigo cancelado).
