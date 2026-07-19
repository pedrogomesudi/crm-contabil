# RF-005 — Contrato de honorários a partir da proposta — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf005-assinatura-proposta-design.md`.

**Objetivo:** um cartão **"Contrato de honorários"** no editor da proposta que mostra, em três passos com
status, o caminho até o contrato assinado (Converter em cliente → Gerar contrato → Enviar para assinatura),
cada passo levando à tela que já existe.

**Arquitetura:** lógica pura `passosContrato`/`rotuloStatusAssinatura` (testável), um leitor server
`carregarEstadoContrato` (lê `oportunidade.cliente_id`, o documento `tipo='Contrato'` e o status em
`assinaturas`), e um componente server `ContratoHonorarios` (stepper com links). Sem migration.

**Stack:** Next.js 16 (server components), Supabase, TypeScript, vitest.

## Global Constraints

- **Sem migration** — usa `oportunidade` (`cliente_id`), `documentos` (`cliente_id`/`nome`/`tipo`/
  `enviado_em`), `assinaturas` (`documento_id`/`status`/`criado_em`), todos existentes.
- **Ponte de leitura + navegação:** a seção **não** gera nem assina — **linka** para as telas existentes
  (`/clientes/novo?oportunidade=<id>` e `/clientes/<clienteId>`). Não reconstruir `gerarContrato`/
  `enviarAssinatura`.
- **Detecção do contrato:** `documentos.tipo = 'Contrato'` com `nome` terminando em `.pdf`, o mais recente
  (`order by enviado_em desc`).
- **Status da assinatura:** `enviado`→"Enviado — aguardando assinatura", `parcial`→"Parcialmente assinado",
  `finalizado`→"Assinado", `recusado`→"Recusado", `cancelado`→"Cancelado", `null`→"Não enviado".
- **Gate:** o do editor de proposta (`podeCriarCliente`), inalterado.
- Reusar `Container`/`Link`. **`ContratoHonorarios` é server component** (só links; sem `"use client"`).
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy só código.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/contratoProposta.ts` | **Criar** — `passosContrato`, `rotuloStatusAssinatura` | 1 |
| `src/tests/comercial/contratoProposta.test.ts` | **Criar** — testes da lógica | 1 |
| `src/app/(app)/comercial/propostas/[id]/contrato-status.ts` | **Criar** — `carregarEstadoContrato` (server) | 2 |
| `src/app/(app)/comercial/propostas/[id]/ContratoHonorarios.tsx` | **Criar** — cartão stepper (server component) | 2 |
| `src/app/(app)/comercial/propostas/[id]/page.tsx` | **Modificar** — carregar estado + renderizar o cartão | 2 |
| `src/tests/comercial/contrato-honorarios-render.test.tsx` | **Criar** — render | 2 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.18.0 | 3 |

---

### Task 1: Lógica pura `contratoProposta.ts`

**Files:**
- Create: `src/lib/comercial/contratoProposta.ts`
- Test: `src/tests/comercial/contratoProposta.test.ts`

**Interfaces:**
- Produces:
  - `type EstadoContrato = { oportunidadeId: string; clienteId: string | null; contratoDocId: string | null; assinaturaStatus: string | null; propostaAceita: boolean }`
  - `type Passo = { chave: "converter" | "gerar" | "assinar"; rotulo: string; situacao: "feito" | "atual" | "pendente"; href: string | null; detalhe?: string }`
  - `passosContrato(e: EstadoContrato): Passo[]`
  - `rotuloStatusAssinatura(status: string | null): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from "vitest";
import { passosContrato, rotuloStatusAssinatura } from "@/lib/comercial/contratoProposta";

const base = {
  oportunidadeId: "op1",
  clienteId: null,
  contratoDocId: null,
  assinaturaStatus: null,
  propostaAceita: true,
};

describe("passosContrato", () => {
  it("sem cliente: converter é o passo atual e linka para a conversão; os demais pendentes sem href", () => {
    const p = passosContrato(base);
    expect(p.map((x) => x.situacao)).toEqual(["atual", "pendente", "pendente"]);
    expect(p[0]!.href).toBe("/clientes/novo?oportunidade=op1");
    expect(p[1]!.href).toBeNull();
  });
  it("com cliente, sem contrato: gerar é o atual e linka para a tela do cliente", () => {
    const p = passosContrato({ ...base, clienteId: "cli1" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "atual", "pendente"]);
    expect(p[0]!.href).toBe("/clientes/cli1");
    expect(p[1]!.href).toBe("/clientes/cli1");
  });
  it("com contrato, enviado: assinar é o atual com o status por extenso", () => {
    const p = passosContrato({ ...base, clienteId: "cli1", contratoDocId: "doc1", assinaturaStatus: "enviado" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "feito", "atual"]);
    expect(p[2]!.detalhe).toBe("Enviado — aguardando assinatura");
  });
  it("assinatura finalizada: todos feitos", () => {
    const p = passosContrato({ ...base, clienteId: "cli1", contratoDocId: "doc1", assinaturaStatus: "finalizado" });
    expect(p.map((x) => x.situacao)).toEqual(["feito", "feito", "feito"]);
  });
});

describe("rotuloStatusAssinatura", () => {
  it("mapeia os status", () => {
    expect(rotuloStatusAssinatura(null)).toBe("Não enviado");
    expect(rotuloStatusAssinatura("finalizado")).toBe("Assinado");
    expect(rotuloStatusAssinatura("recusado")).toBe("Recusado");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/contratoProposta.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export type EstadoContrato = {
  oportunidadeId: string;
  clienteId: string | null;
  contratoDocId: string | null;
  assinaturaStatus: string | null;
  propostaAceita: boolean;
};
export type Passo = {
  chave: "converter" | "gerar" | "assinar";
  rotulo: string;
  situacao: "feito" | "atual" | "pendente";
  href: string | null;
  detalhe?: string;
};

const STATUS: Record<string, string> = {
  enviado: "Enviado — aguardando assinatura",
  parcial: "Parcialmente assinado",
  finalizado: "Assinado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export function rotuloStatusAssinatura(status: string | null): string {
  return status ? (STATUS[status] ?? status) : "Não enviado";
}

export function passosContrato(e: EstadoContrato): Passo[] {
  const feitos = {
    converter: e.clienteId != null,
    gerar: e.contratoDocId != null,
    assinar: e.assinaturaStatus === "finalizado",
  };
  const telaCliente = e.clienteId ? `/clientes/${e.clienteId}` : null;
  const bruto: Omit<Passo, "situacao">[] = [
    {
      chave: "converter",
      rotulo: "Converter em cliente",
      href: e.clienteId ? telaCliente : `/clientes/novo?oportunidade=${e.oportunidadeId}`,
    },
    { chave: "gerar", rotulo: "Gerar contrato", href: telaCliente },
    {
      chave: "assinar",
      rotulo: "Enviar para assinatura",
      href: telaCliente,
      detalhe: rotuloStatusAssinatura(e.assinaturaStatus),
    },
  ];
  let atualUsado = false;
  return bruto.map((p) => {
    const feito = feitos[p.chave];
    let situacao: Passo["situacao"];
    if (feito) situacao = "feito";
    else if (!atualUsado) {
      situacao = "atual";
      atualUsado = true;
    } else situacao = "pendente";
    // passo pendente ainda não navega
    const href = situacao === "pendente" && !feitos.converter ? null : p.href;
    return { ...p, situacao, href };
  });
}
```

> Regra do `href`: um passo `pendente` só ganha destino quando o cliente já existe (senão `null`) — casa
> com os testes (`gerar`/`assinar` pendentes sem cliente → `href = null`).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/contratoProposta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/contratoProposta.ts src/tests/comercial/contratoProposta.test.ts
git commit -m "feat(comercial): passosContrato + rotuloStatusAssinatura (logica pura)"
```

---

### Task 2: Leitor server + cartão + integração

**Files:**
- Create: `src/app/(app)/comercial/propostas/[id]/contrato-status.ts`
- Create: `src/app/(app)/comercial/propostas/[id]/ContratoHonorarios.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/page.tsx`
- Test: `src/tests/comercial/contrato-honorarios-render.test.tsx`

**Interfaces:**
- Consumes: `passosContrato`/`Passo`/`EstadoContrato` (Task 1); `PropostaView` (`proposta.oportunidadeId`,
  `proposta.status`).
- Produces: `carregarEstadoContrato(oportunidadeId, propostaAceita): Promise<EstadoContrato>`;
  `ContratoHonorarios({ passos, propostaAceita, concluido })`.

- [ ] **Step 1: Leitor server `contrato-status.ts`**

```ts
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { EstadoContrato } from "@/lib/comercial/contratoProposta";

export async function carregarEstadoContrato(
  oportunidadeId: string,
  propostaAceita: boolean,
): Promise<EstadoContrato> {
  const vazio: EstadoContrato = {
    oportunidadeId,
    clienteId: null,
    contratoDocId: null,
    assinaturaStatus: null,
    propostaAceita,
  };
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return vazio;
  const supabase = await createServerSupabase();

  const { data: op } = await supabase
    .from("oportunidade")
    .select("cliente_id")
    .eq("id", oportunidadeId)
    .maybeSingle();
  const clienteId = (op?.cliente_id as string | null) ?? null;
  if (!clienteId) return vazio;

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, nome")
    .eq("cliente_id", clienteId)
    .eq("tipo", "Contrato")
    .ilike("nome", "%.pdf")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const contratoDocId = (doc?.id as string | null) ?? null;
  if (!contratoDocId) return { ...vazio, clienteId };

  const { data: ass } = await supabase
    .from("assinaturas")
    .select("status")
    .eq("documento_id", contratoDocId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ...vazio, clienteId, contratoDocId, assinaturaStatus: (ass?.status as string | null) ?? null };
}
```

- [ ] **Step 2: Teste de render do cartão**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContratoHonorarios } from "@/app/(app)/comercial/propostas/[id]/ContratoHonorarios";
import { passosContrato } from "@/lib/comercial/contratoProposta";

const estado = {
  oportunidadeId: "op1",
  clienteId: "cli1",
  contratoDocId: "doc1",
  assinaturaStatus: "enviado",
  propostaAceita: true,
};

describe("ContratoHonorarios", () => {
  it("renderiza os três passos e o status da assinatura", () => {
    const html = renderToStaticMarkup(
      <ContratoHonorarios passos={passosContrato(estado)} propostaAceita concluido={false} />,
    );
    expect(html).toContain("Contrato de honorários");
    expect(html).toContain("Converter em cliente");
    expect(html).toContain("Gerar contrato");
    expect(html).toContain("Enviar para assinatura");
    expect(html).toContain("Enviado — aguardando assinatura");
  });
  it("nota quando a proposta não está aceita", () => {
    const html = renderToStaticMarkup(
      <ContratoHonorarios
        passos={passosContrato({ ...estado, clienteId: null, contratoDocId: null, assinaturaStatus: null })}
        propostaAceita={false}
        concluido={false}
      />,
    );
    expect(html).toContain("Marque a proposta como aceita");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/contrato-honorarios-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Componente `ContratoHonorarios` (server)**

Server component (sem `"use client"`). Props: `passos: Passo[]`, `propostaAceita: boolean`,
`concluido: boolean`. Renderiza um cartão `rounded-2xl border border-linha bg-white p-4`:
- Título **"Contrato de honorários"**.
- Se `concluido`: um bloco de conclusão "Contrato de honorários assinado" (verde) com o link para a tela do
  cliente (o `href` do passo `assinar`, se houver).
- Senão: o **stepper** — para cada passo, uma linha com o indicador (`✓` se `feito`; um ponto cheio verde se
  `atual`; um ponto apagado se `pendente`), o `rotulo`, o `detalhe` (quando houver, ex. status), e — quando
  `situacao === "atual"` e `href` não é null — um `<Link href={passo.href}>` com o rótulo de ação
  ("Converter", "Gerar", "Enviar"). Passos `feito` com `href` podem mostrar um link discreto "ver".
- Se **não** `propostaAceita`: acima do stepper, uma nota discreta
  "Marque a proposta como aceita para seguir com o contrato."

Usar `import Link from "next/link"`. Sem estado, sem client.

- [ ] **Step 5: Integrar no `[id]/page.tsx`**

Carregar o estado e renderizar o cartão após o `EditorProposta`:
```tsx
import { carregarEstadoContrato } from "./contrato-status";
import { ContratoHonorarios } from "./ContratoHonorarios";
import { passosContrato } from "@/lib/comercial/contratoProposta";
// ...
  const propostaAceita = proposta.status === "aceita";
  const estado = await carregarEstadoContrato(proposta.oportunidadeId, propostaAceita);
  const passos = passosContrato(estado);
  const concluido = passos.every((p) => p.situacao === "feito");
// ...no JSX, após <EditorProposta .../>:
  <ContratoHonorarios passos={passos} propostaAceita={propostaAceita} concluido={concluido} />
```

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/contrato-honorarios-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: Conferência na tela** — `npm run dev`: abrir uma proposta; sem cliente, o passo 1 é o atual
  com link; converter, voltar; gerar o contrato no cliente, voltar; o cartão avança. **Mostrar ao Pedro.**

- [ ] **Step 8: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): cartao Contrato de honorarios na proposta (ponte para assinatura)"
```

---

### Task 3: Release 6.18.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.17.0` → `6.18.0`.
- `CHANGELOG.md`: `## [6.18.0] — <data>` com `### Adicionado` (na proposta, o cartão guiado até o contrato
  de honorários assinado — converter/gerar/enviar, com status). **Fecha a RF-005.**
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-005: contrato de honorários a partir da proposta (v6.18.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Sem migration.** Sequência: merge → **Implantar** → confirmar `6.18.0` no `/api/health` → **tag**.

## Self-Review (cobertura da spec)

- `passosContrato`/`rotuloStatusAssinatura` (feito/atual/pendente, hrefs, sem cliente) → Task 1.
- Leitor server (oportunidade.cliente_id → documento `tipo='Contrato'` pdf → assinaturas.status) → Task 2.
- Cartão stepper no editor, nota quando não aceita, estado de conclusão → Task 2.
- Linka para as telas existentes; não reconstrói gerar/assinar → Tasks 1-2 (só `href`).
- Sem migration → nenhuma tarefa de banco.
