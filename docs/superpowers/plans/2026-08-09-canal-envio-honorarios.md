# Canal de envio de honorários por cliente — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada cliente escolha o canal (WhatsApp / E-mail / Ambos) de recebimento dos honorários, e fazer o envio manual de nota + boleto respeitar essa escolha.

**Architecture:** Reusa os flags `clientes_financeiro.cobranca_whatsapp`/`cobranca_email` (sem migration), expostos como um seletor de 3 opções em dois lugares (cadastro e aba Financeiro). O envio em lote de NFS-e evolui para enviar nota + boleto por WhatsApp e/ou e-mail conforme os flags. Decisões de canal ficam em funções puras testáveis; a orquestração de I/O consome-as.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Supabase (Postgres/Storage), Vitest, exceljs (não usado aqui), nodemailer/Resend/SendGrid (e-mail), Z-API/Meta (WhatsApp).

## Global Constraints

- Alias de import `@/*` → `./src/*`. Imagens com `next/image`. Middleware é `proxy.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` só no servidor; nunca `NEXT_PUBLIC_`.
- Rodar antes de commitar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- `main` é protegido: entrega por `develop` → PR → `verify` verde → merge. Deploy é manual no EasyPanel; tag só depois do `/api/health` devolver a versão nova.
- `package.json.version` deve bater com o topo do `CHANGELOG.md` (`src/tests/versao.test.ts`). Release desta feature: **6.90.0 → 6.91.0**.
- **Zero migration**: nenhuma mudança de schema.
- Régua de cobrança automática (`src/lib/whatsapp/regua-motor.ts`, `src/lib/email/regua.ts`) **não é tocada**.

---

### Task 1: Helper puro de mapeamento canal ↔ flags

**Files:**
- Create: `src/lib/clientes/canal-cobranca.ts`
- Test: `src/tests/clientes/canal-cobranca.test.ts`

**Interfaces:**
- Produces: `type CanalCobranca = "whatsapp" | "email" | "ambos"`; `canalParaFlags(canal): { whatsapp: boolean; email: boolean }`; `flagsParaCanal(f: { whatsapp?: boolean | null; email?: boolean | null }): CanalCobranca`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/clientes/canal-cobranca.test.ts
import { describe, it, expect } from "vitest";
import { canalParaFlags, flagsParaCanal } from "@/lib/clientes/canal-cobranca";

describe("canalParaFlags", () => {
  it("whatsapp liga só WhatsApp", () => {
    expect(canalParaFlags("whatsapp")).toEqual({ whatsapp: true, email: false });
  });
  it("email liga só e-mail", () => {
    expect(canalParaFlags("email")).toEqual({ whatsapp: false, email: true });
  });
  it("ambos liga os dois", () => {
    expect(canalParaFlags("ambos")).toEqual({ whatsapp: true, email: true });
  });
});

describe("flagsParaCanal", () => {
  it("mapeia cada combinação", () => {
    expect(flagsParaCanal({ whatsapp: true, email: false })).toBe("whatsapp");
    expect(flagsParaCanal({ whatsapp: false, email: true })).toBe("email");
    expect(flagsParaCanal({ whatsapp: true, email: true })).toBe("ambos");
  });
  it("flags nulos (legado) caem em ambos", () => {
    expect(flagsParaCanal({})).toBe("ambos");
    expect(flagsParaCanal({ whatsapp: null, email: null })).toBe("ambos");
  });
  it("os dois desligados (legado/silenciado) lê como ambos, sem seletor vazio", () => {
    expect(flagsParaCanal({ whatsapp: false, email: false })).toBe("ambos");
  });
  it("round-trip das 3 opções", () => {
    for (const c of ["whatsapp", "email", "ambos"] as const) {
      expect(flagsParaCanal(canalParaFlags(c))).toBe(c);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/clientes/canal-cobranca.test.ts`
Expected: FAIL — módulo `@/lib/clientes/canal-cobranca` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/clientes/canal-cobranca.ts
// Mapeamento entre a escolha do usuário (3 opções) e os dois flags persistidos em
// clientes_financeiro. Puro e sem I/O — reusado no cadastro, na aba Financeiro e no envio.
export type CanalCobranca = "whatsapp" | "email" | "ambos";

export function canalParaFlags(canal: CanalCobranca): { whatsapp: boolean; email: boolean } {
  return {
    whatsapp: canal === "whatsapp" || canal === "ambos",
    email: canal === "email" || canal === "ambos",
  };
}

// Deriva o canal a partir dos flags. Sem nenhum flag ligado (caso legado/silenciado) cai em
// "ambos" — o default histórico — para nunca renderizar um seletor vazio.
export function flagsParaCanal(f: { whatsapp?: boolean | null; email?: boolean | null }): CanalCobranca {
  const wa = f.whatsapp ?? true;
  const em = f.email ?? true;
  if (wa && !em) return "whatsapp";
  if (!wa && em) return "email";
  return "ambos";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/clientes/canal-cobranca.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientes/canal-cobranca.ts src/tests/clientes/canal-cobranca.test.ts
git commit -m "feat(clientes): helper puro canal de cobranca <-> flags"
```

---

### Task 2: Helper puro de decisão de canais no envio

**Files:**
- Create: `src/lib/nfse/envio-canais.ts`
- Test: `src/tests/nfse/envio-canais.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `type Canal = "whatsapp" | "email"`
  - `type StatusCanal = "ok" | "pulado" | "erro"`
  - `type ResultadoCanal = { canal: Canal; status: StatusCanal; motivo?: string }`
  - `canaisParaEnvio(flags: { whatsapp: boolean; email: boolean }, contatos: { temTelefone: boolean; temEmail: boolean }): { enviar: Canal[]; pulados: ResultadoCanal[] }`
  - `agregarResultado(resultados: ResultadoCanal[]): { status: StatusCanal; motivo?: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/nfse/envio-canais.test.ts
import { describe, it, expect } from "vitest";
import { canaisParaEnvio, agregarResultado } from "@/lib/nfse/envio-canais";

describe("canaisParaEnvio", () => {
  it("ambos com contatos envia os dois", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: true }, { temTelefone: true, temEmail: true });
    expect(r.enviar).toEqual(["whatsapp", "email"]);
    expect(r.pulados).toEqual([]);
  });
  it("só whatsapp não dispara e-mail", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: false }, { temTelefone: true, temEmail: true });
    expect(r.enviar).toEqual(["whatsapp"]);
  });
  it("e-mail selecionado sem e-mail cadastrado pula com aviso", () => {
    const r = canaisParaEnvio({ whatsapp: false, email: true }, { temTelefone: true, temEmail: false });
    expect(r.enviar).toEqual([]);
    expect(r.pulados).toEqual([{ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." }]);
  });
  it("whatsapp selecionado sem telefone pula com aviso", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: false }, { temTelefone: false, temEmail: true });
    expect(r.enviar).toEqual([]);
    expect(r.pulados).toEqual([{ canal: "whatsapp", status: "pulado", motivo: "Cliente sem telefone." }]);
  });
});

describe("agregarResultado", () => {
  it("sem nenhum canal é pulado", () => {
    expect(agregarResultado([])).toEqual({ status: "pulado", motivo: "Cliente sem canal com contato." });
  });
  it("qualquer erro vira erro com motivos", () => {
    const r = agregarResultado([
      { canal: "whatsapp", status: "ok" },
      { canal: "email", status: "erro", motivo: "SMTP recusou" },
    ]);
    expect(r.status).toBe("erro");
    expect(r.motivo).toContain("email: SMTP recusou");
  });
  it("algum ok e nenhum erro é ok", () => {
    expect(agregarResultado([{ canal: "whatsapp", status: "ok" }, { canal: "email", status: "pulado", motivo: "x" }])).toEqual({ status: "ok" });
  });
  it("só pulados é pulado com motivos", () => {
    const r = agregarResultado([{ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." }]);
    expect(r.status).toBe("pulado");
    expect(r.motivo).toContain("Cliente sem e-mail.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/nfse/envio-canais.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/nfse/envio-canais.ts
// Decisão pura de quais canais enviar (e quais pular por falta de contato) e como agregar o
// resultado por canal num status único do cliente. Sem I/O.
export type Canal = "whatsapp" | "email";
export type StatusCanal = "ok" | "pulado" | "erro";
export type ResultadoCanal = { canal: Canal; status: StatusCanal; motivo?: string };

export function canaisParaEnvio(
  flags: { whatsapp: boolean; email: boolean },
  contatos: { temTelefone: boolean; temEmail: boolean },
): { enviar: Canal[]; pulados: ResultadoCanal[] } {
  const enviar: Canal[] = [];
  const pulados: ResultadoCanal[] = [];
  if (flags.whatsapp) {
    if (contatos.temTelefone) enviar.push("whatsapp");
    else pulados.push({ canal: "whatsapp", status: "pulado", motivo: "Cliente sem telefone." });
  }
  if (flags.email) {
    if (contatos.temEmail) enviar.push("email");
    else pulados.push({ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." });
  }
  return { enviar, pulados };
}

export function agregarResultado(resultados: ResultadoCanal[]): { status: StatusCanal; motivo?: string } {
  if (resultados.length === 0) return { status: "pulado", motivo: "Cliente sem canal com contato." };
  const erros = resultados.filter((r) => r.status === "erro");
  if (erros.length) return { status: "erro", motivo: erros.map((e) => `${e.canal}: ${e.motivo ?? "falha"}`).join(" · ") };
  if (resultados.some((r) => r.status === "ok")) return { status: "ok" };
  return { status: "pulado", motivo: resultados.map((r) => r.motivo).filter(Boolean).join(" · ") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/nfse/envio-canais.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nfse/envio-canais.ts src/tests/nfse/envio-canais.test.ts
git commit -m "feat(nfse): decisao pura de canais e agregacao do envio"
```

---

### Task 3: Schema aceita `canal_cobranca` e gravação faz upsert dos flags

**Files:**
- Modify: `src/lib/validation/cliente.ts` (adicionar campo ao objeto Zod)
- Modify: `src/lib/clientes/gravar.ts` (remover do payload de `clientes` e upsertar em `clientes_financeiro`)
- Test: `src/tests/clientes/cliente-schema-canal.test.ts`

**Interfaces:**
- Consumes: `canalParaFlags`, `CanalCobranca` (Task 1).
- Produces: `clienteSchema` agora contém `canal_cobranca` (default `"ambos"`); `criarClienteNucleo`/`atualizarClienteNucleo` gravam os flags em `clientes_financeiro`.

- [ ] **Step 1: Write the failing test (schema)**

```ts
// src/tests/clientes/cliente-schema-canal.test.ts
import { describe, it, expect } from "vitest";
import { clienteSchema } from "@/lib/validation/cliente";

const base = {
  tipo_pessoa: "PJ",
  razao_social: "Empresa X",
  cpf_cnpj: "11222333000181",
  regime_tributario: "Simples",
};

describe("clienteSchema canal_cobranca", () => {
  it("aceita as 3 opções", () => {
    for (const c of ["whatsapp", "email", "ambos"]) {
      const r = clienteSchema.safeParse({ ...base, canal_cobranca: c });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.canal_cobranca).toBe(c);
    }
  });
  it("ausente aplica default 'ambos'", () => {
    const r = clienteSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.canal_cobranca).toBe("ambos");
  });
  it("rejeita valor inválido", () => {
    const r = clienteSchema.safeParse({ ...base, canal_cobranca: "sms" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/clientes/cliente-schema-canal.test.ts`
Expected: FAIL — `canal_cobranca` não existe no schema (default indefinido / valor não preservado).

- [ ] **Step 3: Add field to schema**

Em `src/lib/validation/cliente.ts`, dentro do `z.object({...})`, logo após a linha `status: z.enum(STATUS_CLIENTE).optional(),`, adicione:

```ts
    // Canal de recebimento dos honorários. Persistido em clientes_financeiro (não em
    // clientes) — a gravação o remove do payload de clientes e faz upsert dos flags.
    canal_cobranca: z.enum(["whatsapp", "email", "ambos"]).default("ambos"),
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `npx vitest run src/tests/clientes/cliente-schema-canal.test.ts`
Expected: PASS.

- [ ] **Step 5: Upsert dos flags no núcleo de gravação**

Em `src/lib/clientes/gravar.ts`:

(a) No topo, adicione o import:

```ts
import { canalParaFlags, type CanalCobranca } from "@/lib/clientes/canal-cobranca";
```

(b) Crie um helper local (antes de `criarClienteNucleo`):

```ts
// canal_cobranca vem no schema mas mora em clientes_financeiro, não em clientes. Removemos do
// payload de clientes e gravamos os flags separadamente (upsert: a linha pode não existir).
async function gravarCanalCobranca(db: SupabaseClient, clienteId: string, canal: CanalCobranca): Promise<void> {
  const flags = canalParaFlags(canal);
  await db
    .from("clientes_financeiro")
    .upsert({ cliente_id: clienteId, cobranca_whatsapp: flags.whatsapp, cobranca_email: flags.email }, { onConflict: "cliente_id" });
}
```

(c) Em `criarClienteNucleo`, logo após `const payload = limparVazios({ ...input.dados });` e antes do insert, capture e remova o campo:

```ts
  const canal = (input.dados.canal_cobranca ?? "ambos") as CanalCobranca;
  delete payload.canal_cobranca; // não é coluna de clientes
```

Depois do sucesso (após `const id = data[0]!.id as string;` e antes de `await emitir(...)`):

```ts
  await gravarCanalCobranca(ctx.db, id, canal);
```

(d) Em `atualizarClienteNucleo`, o update usa `...limparVazios({ ...input.dados })` inline. Troque esse trecho para remover o campo antes:

```ts
  const payloadUpd = limparVazios({ ...input.dados });
  const canal = (input.dados.canal_cobranca ?? "ambos") as CanalCobranca;
  delete payloadUpd.canal_cobranca;
  const { data, error } = await ctx.db
    .from("clientes")
    .update({
      ...payloadUpd,
      endereco: input.endereco,
      representante: input.representante,
      campos_custom: input.camposCustom,
    })
    .eq("id", clienteId)
    .eq("atualizado_em", input.atualizadoEmEsperado)
    .select("id");
```

E após o sucesso (antes de `await emitir("cliente.atualizado", clienteId);`):

```ts
  await gravarCanalCobranca(ctx.db, clienteId, canal);
```

- [ ] **Step 6: Verify build/typecheck/tests**

Run: `npm run typecheck && npx vitest run src/tests/clientes/`
Expected: typecheck sem erros; testes de cliente passam.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/cliente.ts src/lib/clientes/gravar.ts src/tests/clientes/cliente-schema-canal.test.ts
git commit -m "feat(clientes): schema aceita canal_cobranca e grava flags em clientes_financeiro"
```

---

### Task 4: Componente `SeletorCanalCobranca`

**Files:**
- Create: `src/components/clientes/SeletorCanalCobranca.tsx`

**Interfaces:**
- Consumes: `CanalCobranca` (Task 1).
- Produces: componente client com dois modos:
  - Form: `<SeletorCanalCobranca name="canal_cobranca" inicial={canal} />` — renderiza um `<select name>` nativo (fluí pelo submit do form; sem estado externo obrigatório).
  - Autônomo: `<SeletorCanalCobranca inicial={canal} onSelecionar={(c) => Promise<void>} />` — sem `name`; ao trocar, chama `onSelecionar` e mostra estado "salvando".

- [ ] **Step 1: Create the component**

```tsx
// src/components/clientes/SeletorCanalCobranca.tsx
"use client";
import { useState, useTransition } from "react";
import { controleCls } from "@/components/ui/Campo";
import type { CanalCobranca } from "@/lib/clientes/canal-cobranca";

const OPCOES: { valor: CanalCobranca; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "ambos", rotulo: "WhatsApp e e-mail" },
];

// Um seletor de canal reusado no cadastro (modo form: passa `name`, sem `onSelecionar`) e na
// aba Financeiro (modo autônomo: passa `onSelecionar`, sem `name`, grava na hora).
export function SeletorCanalCobranca({
  inicial,
  name,
  onSelecionar,
  disabled,
}: {
  inicial: CanalCobranca;
  name?: string;
  onSelecionar?: (canal: CanalCobranca) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [valor, setValor] = useState<CanalCobranca>(inicial);
  const [salvando, start] = useTransition();

  function handleChange(next: CanalCobranca) {
    setValor(next);
    if (onSelecionar) start(async () => void (await onSelecionar(next)));
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-cinza">Envio de honorários (nota + boleto)</span>
      <select
        name={name}
        value={valor}
        disabled={disabled || salvando}
        onChange={(e) => handleChange(e.target.value as CanalCobranca)}
        className={controleCls("compacto")}
      >
        {OPCOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {salvando && <span className="text-xs text-cinza">Salvando…</span>}
    </label>
  );
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/clientes/SeletorCanalCobranca.tsx
git commit -m "feat(clientes): componente SeletorCanalCobranca (form + autonomo)"
```

---

### Task 5: FormCliente renderiza o seletor e a edição carrega o canal

**Files:**
- Modify: `src/components/FormCliente.tsx` (seção de contato, ~linhas 228-243)
- Modify: página de edição do cliente que renderiza `<FormCliente>` em modo edição (localizar com o grep abaixo) — passar o canal atual

**Interfaces:**
- Consumes: `SeletorCanalCobranca` (Task 4), `flagsParaCanal`/`CanalCobranca` (Task 1).
- Produces: o form envia `canal_cobranca` no submit; a edição pré-seleciona o canal do cliente.

- [ ] **Step 1: Localizar a edição e a prop de dados do FormCliente**

Run: `grep -rn "FormCliente" src/app/(app)/clientes | grep -v novo`
Run: `sed -n '1,60p' src/components/FormCliente.tsx` (identificar a prop que carrega os valores atuais do cliente em modo edição — ex.: `cliente`/`inicial`/`defaults`)
Expected: descobrir o arquivo da página de edição (provável `src/app/(app)/clientes/[id]/editar/page.tsx` ou aba do `[id]/page.tsx`) e o nome da prop de valores iniciais.

- [ ] **Step 2: Adicionar a prop de canal ao FormCliente**

No `src/components/FormCliente.tsx`, adicione à assinatura de props um campo opcional para o canal inicial (ao lado das demais props de valores iniciais do cliente):

```tsx
  canalInicial = "ambos",
```
e no tipo das props:
```tsx
  canalInicial?: import("@/lib/clientes/canal-cobranca").CanalCobranca;
```

- [ ] **Step 3: Renderizar o seletor na seção de contato**

No `src/components/FormCliente.tsx`, dentro da seção de contato (perto dos campos `email`/`telefone`, ~linha 240), adicione:

```tsx
import { SeletorCanalCobranca } from "@/components/clientes/SeletorCanalCobranca";
// ...
<SeletorCanalCobranca name="canal_cobranca" inicial={canalInicial} />
```

(coloque o `import` junto aos demais imports no topo do arquivo).

- [ ] **Step 4: Passar o canal atual na edição**

Na página de edição, ao carregar o cliente, inclua no `select` do Supabase a relação `clientes_financeiro(cobranca_whatsapp, cobranca_email)` e derive o canal:

```tsx
import { flagsParaCanal } from "@/lib/clientes/canal-cobranca";
// ao montar os dados do cliente:
const fin = Array.isArray(cliente.clientes_financeiro) ? cliente.clientes_financeiro[0] : cliente.clientes_financeiro;
const canalInicial = flagsParaCanal({ whatsapp: fin?.cobranca_whatsapp, email: fin?.cobranca_email });
// ...
<FormCliente /* ...props existentes... */ canalInicial={canalInicial} />
```

(no cadastro NOVO não passe `canalInicial` — o default "ambos" vale.)

- [ ] **Step 5: Verify build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros; a rota de edição de cliente compila.

- [ ] **Step 6: Commit**

```bash
git add src/components/FormCliente.tsx "src/app/(app)/clientes"
git commit -m "feat(clientes): seletor de canal no cadastro; edicao carrega o canal atual"
```

---

### Task 6: Aba Financeiro usa o seletor (substitui os dois checkboxes)

**Files:**
- Modify: `src/components/clientes/OptOutCobranca.tsx`
- Modify: `src/app/(app)/financeiro/regua-cobranca/optout.ts` (adicionar `definirCanalCobranca`)

**Interfaces:**
- Consumes: `SeletorCanalCobranca` (Task 4), `flagsParaCanal`/`canalParaFlags`/`CanalCobranca` (Task 1), `setAceitaComunicados` (já existe).
- Produces: `definirCanalCobranca(clienteId: string, canal: CanalCobranca): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Nova server action que grava os dois flags de uma vez**

Em `src/app/(app)/financeiro/regua-cobranca/optout.ts`, adicione (mantendo `setOptOutCobranca` como está, ainda usada pela régua/outros):

```ts
import { canalParaFlags, type CanalCobranca } from "@/lib/clientes/canal-cobranca";

// Grava o canal de cobrança (3 opções) nos dois flags de uma vez. Usada pela ficha do cliente.
export async function definirCanalCobranca(
  clienteId: string,
  canal: CanalCobranca,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return { erro: "Sem permissão." };
  const flags = canalParaFlags(canal);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes_financeiro")
    .upsert({ cliente_id: clienteId, cobranca_whatsapp: flags.whatsapp, cobranca_email: flags.email }, { onConflict: "cliente_id" });
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: OptOutCobranca renderiza o seletor**

Reescreva `src/components/clientes/OptOutCobranca.tsx` para trocar os dois checkboxes de canal pelo seletor (mantendo o checkbox "Aceita comunicados"):

```tsx
"use client";
import { useState, useTransition } from "react";
import { definirCanalCobranca } from "@/app/(app)/financeiro/regua-cobranca/optout";
import { setAceitaComunicados } from "@/app/(app)/comunicados/actions";
import { SeletorCanalCobranca } from "@/components/clientes/SeletorCanalCobranca";
import { flagsParaCanal } from "@/lib/clientes/canal-cobranca";

// Canal de cobrança (WhatsApp/E-mail/Ambos) + a permissão de comunicados (finalidade LGPD
// distinta). O canal grava os dois flags via definirCanalCobranca.
export function OptOutCobranca({
  clienteId,
  whatsapp,
  email,
  comunicados,
}: {
  clienteId: string;
  whatsapp: boolean;
  email: boolean;
  comunicados: boolean;
}) {
  const [com, setCom] = useState(comunicados);
  const [pend, start] = useTransition();
  const canalInicial = flagsParaCanal({ whatsapp, email });

  return (
    <div className="space-y-2 text-sm">
      <SeletorCanalCobranca inicial={canalInicial} onSelecionar={(c) => definirCanalCobranca(clienteId, c).then(() => undefined)} />
      <label className="flex items-center gap-2 border-t border-linha pt-2">
        <input
          type="checkbox"
          checked={com}
          disabled={pend}
          onChange={() =>
            start(async () => {
              const r = await setAceitaComunicados(clienteId, !com);
              if (!r.erro) setCom(!com);
            })
          }
        />
        Aceita comunicados (avisos de legislação e prazos)
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/clientes/OptOutCobranca.tsx "src/app/(app)/financeiro/regua-cobranca/optout.ts"
git commit -m "feat(clientes): aba Financeiro usa seletor de canal (substitui checkboxes)"
```

---

### Task 7: Envio unificado nota + boleto respeitando o canal

**Files:**
- Modify: `src/app/(app)/nfse/lote/envio.ts`
- Test: (coberto pelos helpers puros das Tasks 1 e 2; a orquestração é integração — verificação manual)

**Interfaces:**
- Consumes: `canaisParaEnvio`, `agregarResultado`, `ResultadoCanal` (Task 2); `flagsParaCanal` (Task 1); `enviarProativo`/`criarEnviadorProativo` (existe); `enviarEmail`, `type Anexo` (`@/lib/email/enviar`); `obterDanfsePdf`, `caminhoDanfse` (existe); `linhasPagamento`, `montarMensagemNota`, `competenciaBR`, `vencimentoBR`, `valorBR` (existe).
- Produces: `enviarHonorarioLote(nfseId: string): Promise<ResultadoEnvioNota>` substituindo `enviarNotaWhatsapp`. `ResultadoEnvioNota` mantém `{ status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string }`.

- [ ] **Step 1: Buscar o boleto do honorário (helper local no envio)**

No `src/app/(app)/nfse/lote/envio.ts`, adicione um helper que, dado cliente+competência, retorna os dados de pagamento do boleto (ou null):

```ts
// Boleto do honorário = boleto ativo do título MENSALIDADE do cliente naquela competência.
// Opcional: sem boleto, envia só a nota.
async function boletoDoHonorario(
  admin: ReturnType<typeof createAdminSupabase>,
  clienteId: string,
  competencia: string,
): Promise<{ linhaDigitavel: string | null; pixCopiaCola: string | null; pdfPath: string | null } | null> {
  const { data: titulo } = await admin
    .from("titulo")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("origem", "MENSALIDADE")
    .limit(1)
    .maybeSingle();
  if (!titulo) return null;
  const { data: bol } = await admin
    .from("boleto")
    .select("linha_digitavel, pix_copia_cola, pdf_path")
    .eq("titulo_id", titulo.id as string)
    .not("status", "in", "(cancelado,erro)")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bol) return null;
  return {
    linhaDigitavel: (bol.linha_digitavel as string | null) ?? null,
    pixCopiaCola: (bol.pix_copia_cola as string | null) ?? null,
    pdfPath: (bol.pdf_path as string | null) ?? null,
  };
}
```

- [ ] **Step 2: Envio por WhatsApp (extrair do fluxo atual, acrescentando o boleto no texto)**

Adicione um helper que envia a nota por WhatsApp e devolve `ResultadoCanal`. Reusa o miolo do atual `enviarNotaWhatsapp`, com o texto acrescido de linha digitável/Pix do boleto:

```ts
async function enviarPorWhatsapp(args: {
  tel: string;
  texto: string; // já inclui pagamento + boleto
  params: string[];
  pdfBase64: string;
  nomeArq: string;
}): Promise<ResultadoCanal> {
  const enviador = await criarEnviadorProativo();
  if ("erro" in enviador) return { canal: "whatsapp", status: "erro", motivo: enviador.erro };
  const r = await enviador.enviar(args.tel, {
    fluxo: "nfse",
    texto: args.texto,
    params: args.params,
    midia: { tipo: "document", base64: args.pdfBase64, mime: "application/pdf", nome: args.nomeArq, caption: args.texto },
  });
  return r.ok ? { canal: "whatsapp", status: "ok" } : { canal: "whatsapp", status: "erro", motivo: r.erro ?? "Falha no envio." };
}
```

- [ ] **Step 3: Envio por e-mail (novo: nota + boleto anexos)**

```ts
import { enviarEmail, type Anexo } from "@/lib/email/enviar";
// ...
async function enviarPorEmail(args: {
  para: string;
  assunto: string;
  corpo: string; // mensagem + pagamento + boleto (texto)
  notaPdfBase64: string;
  notaNome: string;
  boletoPdf: Buffer | null;
  razaoSocial: string;
}): Promise<ResultadoCanal> {
  const anexos: Anexo[] = [{ nome: args.notaNome, conteudo: Buffer.from(args.notaPdfBase64, "base64"), tipo: "application/pdf" }];
  if (args.boletoPdf) anexos.push({ nome: `Boleto ${args.razaoSocial}.pdf`, conteudo: args.boletoPdf, tipo: "application/pdf" });
  const r = await enviarEmail({ para: args.para, assunto: args.assunto, corpo: args.corpo, anexos });
  return r.ok ? { canal: "email", status: "ok" } : { canal: "email", status: "erro", motivo: r.erro };
}
```

- [ ] **Step 4: Orquestrar em `enviarHonorarioLote`**

Renomeie/reescreva `enviarNotaWhatsapp` para `enviarHonorarioLote(nfseId)`, mantendo o tipo de retorno. Fluxo:

```ts
export async function enviarHonorarioLote(nfseId: string): Promise<ResultadoEnvioNota> {
  const perfil = await gate();
  if (!perfil) return { status: "erro", motivo: "Sem permissão.", razaoSocial: "" };
  const admin = createAdminSupabase();
  const { data: nota } = await admin
    .from("nfse")
    .select(
      "id, cliente_id, valor, competencia, chave_acesso, ambiente, emitente, clientes(razao_social, responsavel_nome, telefone, telefone_ddi, email, clientes_financeiro(cobranca_whatsapp, cobranca_email, dia_vencimento))",
    )
    .eq("id", nfseId)
    .maybeSingle();
  const cl = nota ? (Array.isArray(nota.clientes) ? nota.clientes[0] : nota.clientes) as {
    razao_social?: string; responsavel_nome?: string | null; telefone?: string; telefone_ddi?: string; email?: string | null;
    clientes_financeiro?: { cobranca_whatsapp?: boolean; cobranca_email?: boolean; dia_vencimento?: number | null } | { cobranca_whatsapp?: boolean; cobranca_email?: boolean; dia_vencimento?: number | null }[];
  } | null : null;
  const razaoSocial = cl?.razao_social ?? "";
  if (!nota) return { status: "erro", motivo: "Nota não encontrada.", razaoSocial };
  const fin = Array.isArray(cl?.clientes_financeiro) ? cl?.clientes_financeiro[0] : cl?.clientes_financeiro;

  // Canais alvo a partir dos flags + contatos disponíveis.
  const tel = normalizarTelefone(cl?.telefone ?? "", cl?.telefone_ddi ?? "55");
  const email = (cl?.email ?? "").trim();
  const flags = { whatsapp: fin?.cobranca_whatsapp ?? true, email: fin?.cobranca_email ?? true };
  const { enviar, pulados } = canaisParaEnvio(flags, { temTelefone: Boolean(tel), temEmail: Boolean(email) });
  if (enviar.length === 0) return { ...agregarResultado(pulados), razaoSocial };

  // DANFSe PDF (só pagamos o custo se há canal para enviar).
  const pdfR = await obterDanfsePdf(admin, {
    chave_acesso: nota.chave_acesso as string,
    ambiente: nota.ambiente as string | null,
    emitente: nota.emitente as string,
    cliente_id: nota.cliente_id as string,
  });
  if (!pdfR.pdfBase64) return { status: "erro", motivo: pdfR.erro ?? "DANFSe indisponível.", razaoSocial };

  // Dados de pagamento (dados bancários + boleto do honorário).
  const { data: dados } = await admin
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento, mensagem_template")
    .eq("id", 1)
    .maybeSingle();
  const boleto = await boletoDoHonorario(admin, nota.cliente_id as string, String(nota.competencia));
  const vencimento = vencimentoBR(String(nota.competencia), (fin?.dia_vencimento as number | null) ?? null);
  const pagamento = linhasPagamento({
    pixChave: dados?.pix_chave, banco: dados?.banco, agencia: dados?.agencia,
    conta: dados?.conta, titular: dados?.titular, documento: dados?.documento,
  });
  const extraBoleto: string[] = [];
  if (boleto?.linhaDigitavel) extraBoleto.push(`Linha digitável do boleto: ${boleto.linhaDigitavel}`);
  if (boleto?.pixCopiaCola) extraBoleto.push(`PIX copia-e-cola:\n${boleto.pixCopiaCola}`);
  const template = dados?.mensagem_template ?? "Olá {nome}! Segue a sua NFS-e — honorário de R$ {valor}, competência {competencia}.\n\n{pagamento}";
  const nome = (cl?.responsavel_nome as string | null) || razaoSocial;
  const texto = [
    montarMensagemNota(template, {
      nome, empresa: razaoSocial, competencia: competenciaBR(String(nota.competencia)),
      valor: valorBR(Number(nota.valor)), vencimento, pix: dados?.pix_chave ?? "",
      favorecido: dados?.titular ?? "", cnpj: dados?.documento ?? "", banco: dados?.banco ?? "",
      agencia: dados?.agencia ?? "", conta: dados?.conta ?? "", pagamento,
    }),
    ...extraBoleto,
  ].join("\n\n");
  const params = [nome, competenciaBR(String(nota.competencia)), valorBR(Number(nota.valor)), vencimento];
  const nomeArq = `NFS-e ${razaoSocial}.pdf`;

  // Boleto PDF para anexo de e-mail (se houver pdf_path no bucket "documentos").
  let boletoPdf: Buffer | null = null;
  if (enviar.includes("email") && boleto?.pdfPath) {
    const { data: blob } = await admin.storage.from("documentos").download(boleto.pdfPath);
    if (blob) boletoPdf = Buffer.from(await blob.arrayBuffer());
  }

  const resultados: ResultadoCanal[] = [...pulados];
  for (const canal of enviar) {
    if (canal === "whatsapp") {
      const r = await enviarPorWhatsapp({ tel, texto, params, pdfBase64: pdfR.pdfBase64, nomeArq });
      resultados.push(r);
      await admin.from("whatsapp_mensagem").insert({
        cliente_id: nota.cliente_id, telefone: tel, texto, status: r.status === "ok" ? "ENVIADO" : "ERRO",
        direcao: "OUT", lida: true, resposta: {}, criado_por: perfil.id, nfse_id: nfseId,
        midia_tipo: "document", midia_path: caminhoDanfse(pdfR.chave as string), midia_nome: nomeArq, midia_mime: "application/pdf",
      });
    } else {
      const r = await enviarPorEmail({
        para: email, assunto: `NFS-e e boleto — ${competenciaBR(String(nota.competencia))} — ${razaoSocial}`,
        corpo: texto, notaPdfBase64: pdfR.pdfBase64, notaNome: nomeArq, boletoPdf, razaoSocial,
      });
      resultados.push(r);
      await admin.from("email_mensagem").insert({
        cliente_id: nota.cliente_id, para: email, assunto: `NFS-e e boleto — ${razaoSocial}`,
        corpo: texto, anexos: boletoPdf ? ["nota", "boleto"] : ["nota"],
        status: r.status === "ok" ? "ENVIADO" : "ERRO", erro: r.status === "erro" ? (r.motivo ?? null) : null, enviado_por: perfil.id,
      });
    }
  }
  return { ...agregarResultado(resultados), razaoSocial };
}
```

Adicione os imports no topo do arquivo:
```ts
import { canaisParaEnvio, agregarResultado, type ResultadoCanal } from "@/lib/nfse/envio-canais";
```
(Mantenha `ResultadoEnvioNota` como já definido no arquivo.)

- [ ] **Step 5: Verify typecheck/lint/build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros. (Se `email_mensagem.status` for enum, ajuste o valor para o rótulo aceito; confirme com `grep -rn "email_mensagem" supabase/migrations`.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/nfse/lote/envio.ts"
git commit -m "feat(nfse): envio de honorarios em lote (nota+boleto) por whatsapp e/ou email"
```

---

### Task 8: UI da tela de envio (canal, selo "já enviado" nos dois históricos, rótulos)

**Files:**
- Modify: `src/app/(app)/nfse/lote/envio.ts` (`listarNotasParaEnvio`: incluir canal e já-enviado por e-mail)
- Modify: `src/components/nfse/EnviarNotasWhatsapp.tsx` (renomear conceito, mostrar canal; chamar `enviarHonorarioLote`)
- Modify: `src/app/(app)/nfse/lote/page.tsx` (rótulos)

**Interfaces:**
- Consumes: `flagsParaCanal`/`CanalCobranca` (Task 1); `enviarHonorarioLote` (Task 7).
- Produces: `listarNotasParaEnvio` retorna `{ nfseId; razaoSocial; jaEnviada: boolean; canal: CanalCobranca; semContato: boolean }[]`.

- [ ] **Step 1: `listarNotasParaEnvio` inclui canal e histórico de e-mail**

Em `src/app/(app)/nfse/lote/envio.ts`, ajuste `listarNotasParaEnvio` para trazer os flags do cliente e considerar `email_mensagem` no "já enviada". Como as notas já vêm de `listarNotasAutorizadasPorCompetencia`, carregue os flags por `cliente_id`:

```ts
export async function listarNotasParaEnvio(
  competencia: string,
): Promise<{ nfseId: string; razaoSocial: string; jaEnviada: boolean; canal: CanalCobranca; semContato: boolean }[]> {
  if (!(await gate())) return [];
  const notas = await listarNotasAutorizadasPorCompetencia(competencia);
  if (notas.length === 0) return [];
  const admin = createAdminSupabase();
  const ids = notas.map((n) => n.nfseId);
  const { data: waRows } = await admin.from("whatsapp_mensagem").select("nfse_id").eq("status", "ENVIADO").in("nfse_id", ids);
  const enviadasWa = new Set((waRows ?? []).map((r) => r.nfse_id as string));
  // Canal + contatos por nota exigem os dados do cliente; reusa o mesmo select do envio,
  // mas basta o cliente. Buscar por cliente_id das notas.
  // (Implementação: adaptar listarNotasAutorizadasPorCompetencia para já retornar cliente_id,
  //  telefone, email e flags — ver Step 2 — evitando N+1.)
  return notas.map((n) => {
    const flags = { whatsapp: n.cobrancaWhatsapp ?? true, email: n.cobrancaEmail ?? true };
    const canal = flagsParaCanal(flags);
    const temTelefone = Boolean((n.telefone ?? "").trim());
    const temEmail = Boolean((n.email ?? "").trim());
    // "sem contato" = nenhum canal selecionado tem contato para enviar (reusa a mesma decisão do envio).
    const semContato = canaisParaEnvio(flags, { temTelefone, temEmail }).enviar.length === 0;
    return { nfseId: n.nfseId, razaoSocial: n.razaoSocial, jaEnviada: enviadasWa.has(n.nfseId), canal, semContato };
  });
}
```

- [ ] **Step 2: Enriquecer `listarNotasAutorizadasPorCompetencia`**

Run: `grep -rn "export async function listarNotasAutorizadasPorCompetencia" src/app/(app)/clientes/[id]/nfse.ts`
Ajuste o `select` dessa função para incluir `clientes(telefone, telefone_ddi, email, clientes_financeiro(cobranca_whatsapp, cobranca_email))` e propague `cliente_id, telefone, email, cobrancaWhatsapp, cobrancaEmail` no objeto retornado, para `listarNotasParaEnvio` não fazer N+1. Mantenha os campos já retornados (`nfseId`, `razaoSocial`).

- [ ] **Step 3: Componente de envio consome o novo shape e chama `enviarHonorarioLote`**

Em `src/components/nfse/EnviarNotasWhatsapp.tsx`:
- Troque a chamada `enviarNotaWhatsapp(...)` por `enviarHonorarioLote(...)`.
- Na linha de cada cliente, mostre o canal (`WhatsApp` / `E-mail` / `WhatsApp e e-mail`) e um aviso quando `semContato` (ex.: badge "sem contato do canal").
- Atualize títulos/labels de "Enviar notas por WhatsApp" para "Enviar honorários (nota + boleto)".

(Preserve a mecânica de seleção/progresso já existente; só troca a fonte de dados e a action.)

- [ ] **Step 4: Rótulos da página**

Em `src/app/(app)/nfse/lote/page.tsx`, ajuste título/descrição para refletir "Envio de honorários — nota + boleto por WhatsApp e/ou e-mail".

- [ ] **Step 5: Verify build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/nfse/lote" "src/components/nfse/EnviarNotasWhatsapp.tsx" "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat(nfse): tela de envio de honorarios mostra canal e considera e-mail no ja-enviado"
```

---

### Task 9: Release 6.91.0

**Files:**
- Modify: `package.json` (version)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump da versão**

Em `package.json`, troque `"version": "6.90.0"` por `"version": "6.91.0"`.

- [ ] **Step 2: Entrada no CHANGELOG**

No topo do `CHANGELOG.md`, logo após `## [Não lançado]`, adicione:

```markdown
## [6.91.0] — 2026-08-09

### Adicionado

- **Canal de envio de honorários por cliente.** Cada cliente agora escolhe como recebe a
  NFS-e e o boleto — **WhatsApp, e-mail ou ambos** — no cadastro e na aba Financeiro da
  ficha. O **envio de honorários em lote** passou a mandar **nota + boleto juntos** pelo(s)
  canal(is) escolhido(s): por WhatsApp a nota vai em PDF com a linha digitável e o Pix no
  texto; por e-mail vão a nota e o boleto como anexos. Clientes sem o contato do canal são
  pulados com aviso. A régua de cobrança automática não mudou.
```

- [ ] **Step 3: Verificação completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: tudo verde; `src/tests/versao.test.ts` passa (versão bate com o CHANGELOG).

- [ ] **Step 4: Commit, push e PR**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): 6.91.0 — canal de envio de honorarios por cliente"
git push origin develop
gh pr create --base main --head develop --title "feat: canal de envio de honorarios por cliente (6.91.0)" --body "Ver docs/superpowers/specs/2026-08-09-canal-envio-honorarios-design.md"
gh pr checks --watch
```

- [ ] **Step 5: Merge após `verify` verde**

```bash
gh pr merge --merge
```

(Deploy manual no EasyPanel e tag `v6.91.0` só depois do `/api/health` devolver 6.91.0 — passo operacional do usuário.)

---

## Self-review (cobertura do spec)

- Preferência de canal sem migration (reuso dos flags) → Tasks 1, 3, 6. ✓
- Seletor em dois lugares (cadastro + aba Financeiro) → Tasks 4, 5, 6. ✓
- Substituir os checkboxes da aba Financeiro → Task 6. ✓
- Envio unificado nota + boleto respeitando canal (WA: nota PDF + boleto no texto; e-mail: anexos) → Task 7. ✓
- Pular por falta de contato + agregação por canal → Tasks 2, 7. ✓
- Histórico nos dois canais + selo "já enviado" considerando e-mail → Tasks 7, 8. ✓
- Régua automática intacta / zero migration → não há task que toque `regua-motor.ts`/migrations. ✓
- Release 6.91.0 + fluxo de entrega → Task 9. ✓
```
