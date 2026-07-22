# Alterar vencimento do título — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reagendar o vencimento de uma conta a receber (título) em um clique — e, havendo boleto ativo, reemiti-lo com a nova data — substituindo o "Alterar vencimento" do boleto (6.67.0).

**Architecture:** Nova action `alterarVencimentoTitulo` em `boleto-actions.ts` (onde já vivem `cancelarTitulo`, `emitirBoletoNucleo`, `cancelarBoletoNoInter`, `validarNovaVencimento`): valida a data → atualiza `titulo.vencimento` (admin) → se houver boleto `emitido`, cancela + reemite com a nova data. Um novo componente `AlterarVencimentoTitulo` põe o botão no nível da linha do título. O botão "Alterar vencimento" do boleto e a action `alterarVencimentoBoleto` são removidos. Sem migration.

**Tech Stack:** Next.js 16 · TypeScript · Supabase · Vitest.

## Global Constraints

- **Reagenda o TÍTULO**; se houver boleto ativo, **cancela + reemite** com a nova data (ordem cancelar→reemitir). Falha na reemissão → título já reagendado, retryável via "Emitir boleto".
- **Só título em aberto** (`podeCancelarTitulo(status, somaBaixado)` = ABERTO/VENCIDO sem baixa). VENCIDO é derivado, não persistido — reagendar pra frente volta o rótulo a "Em aberto" sozinho, sem escrever status.
- **`novaData` ≥ hoje** e ≠ atual (via `validarNovaVencimento`).
- **Substitui** o "Alterar vencimento" do boleto: remover o botão em `BoletoTitulo`, a action `alterarVencimentoBoleto` e o teste `alterar-vencimento-render.test.tsx`. Manter `emitirBoletoNucleo`, `validarNovaVencimento` e `BoletoView.vencimento`.
- **Inputs:** `controleCls()` (guard `divida-ui`).
- **Sem migration.**
- **Comandos antes de commitar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- **Git:** `develop` → PR para `main` com `verify` verde.

**Fatos verificados:**
- `boleto-actions.ts` já importa `revalidatePath`, `createServerSupabase`, `createAdminSupabase`, `adaptadorAtivo`, `dadosEmissaoDeTitulo`, `cancelarBoletoNoInter`, `podeCancelarTitulo`, `validarNovaVencimento`; contém `gate()`, `emitirBoletoNucleo` (privado), `cancelarTitulo`.
- `TituloView` (em `actions.ts`) tem `vencimento`. `ContasReceber.tsx` refresca com `start(async () => { setTitulos(await listarTitulos(competencia)); setBoletos(await listarBoletosDaCompetencia(competencia)); })` e mostra "Cancelar" sob `podeCancelarTitulo(status, t.somaBaixado)`.
- `ehVencido` (`src/lib/financeiro/titulos.ts`) deriva "Vencido"; status armazenado de aberto é `ABERTO`.

**Ordenação (evita import órfão de lint):** adicionar a action e a UI do título **antes** de remover a do boleto.

---

## File Structure

- `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts` (Modify) — nova action `alterarVencimentoTitulo`; depois, remoção de `alterarVencimentoBoleto`.
- `src/components/financeiro/AlterarVencimentoTitulo.tsx` (Create) — botão + campo de data no nível do título.
- `src/components/financeiro/ContasReceber.tsx` (Modify) — renderiza o novo componente na linha.
- `src/components/financeiro/BoletoTitulo.tsx` (Modify) — remove o botão "Alterar vencimento" do boleto.
- `src/tests/financeiro/alterar-vencimento-titulo-render.test.tsx` (Create) — render do botão do título.
- `src/tests/financeiro/alterar-vencimento-render.test.tsx` (Delete) — era do botão do boleto.

---

### Task 1: Action `alterarVencimentoTitulo`

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

**Interfaces:**
- Consumes: `emitirBoletoNucleo`, `cancelarBoletoNoInter`, `validarNovaVencimento`, `podeCancelarTitulo`, `createAdminSupabase`, `createServerSupabase`, `gate` (todos já no arquivo/importados).
- Produces: `alterarVencimentoTitulo(tituloId: string, novaData: string): Promise<{ ok?: boolean; erro?: string }>`.

Sem teste unitário de action (o módulo não tem harness de mock de Supabase). Cobertura: `validarNovaVencimento` (já testado) + typecheck/build + smoke.

- [ ] **Step 1: Adicionar a action (ao final do arquivo)**

```ts
// Reagenda o vencimento de um título em aberto e, se houver boleto ativo, reemite-o com a nova
// data (cancela → reemite). Só o título muda de data; o boleto acompanha. Se a reemissão falhar
// após o título já ter sido reagendado, reporta e deixa retryável via "Emitir boleto".
export async function alterarVencimentoTitulo(
  tituloId: string,
  novaData: string,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  const { data: t } = await admin
    .from("titulo")
    .select("id, valor, descricao, status, cliente_id, vencimento, baixa(valor_recebido, estornada)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const somaBaixado = ((t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[])
    .filter((x) => !x.estornada)
    .reduce((s, x) => s + Number(x.valor_recebido), 0);
  if (!podeCancelarTitulo(t.status as string, somaBaixado))
    return { erro: "Só é possível reagendar título em aberto (sem baixa)." };

  const hojeISO = new Date().toISOString().slice(0, 10);
  const val = validarNovaVencimento(novaData, t.vencimento as string, hojeISO);
  if ("erro" in val) return { erro: val.erro };

  const { error: errUpd } = await admin.from("titulo").update({ vencimento: novaData }).eq("id", tituloId);
  if (errUpd) return { erro: "Falha ao reagendar o título." };

  // Se houver boleto ativo, reemite com a nova data (cancela → reemite).
  const { data: bol } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("titulo_id", tituloId)
    .eq("status", "emitido")
    .maybeSingle();
  if (bol) {
    const motivo = `Alteração de vencimento para ${novaData.slice(8, 10)}/${novaData.slice(5, 7)}/${novaData.slice(0, 4)}`;
    try {
      await cancelarBoletoNoInter(
        admin,
        {
          id: bol.id as string,
          provedor: bol.provedor as string,
          provedor_boleto_id: (bol.provedor_boleto_id as string | null) ?? null,
          status: bol.status as string,
        },
        motivo,
      );
    } catch (e) {
      return {
        erro: `Vencimento alterado, mas falhou ao cancelar o boleto: ${(e as Error).message} Use "Emitir boleto".`,
      };
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
      return {
        erro: `Vencimento alterado, mas a reemissão do boleto falhou: ${r.erro} Use "Emitir boleto" para gerar novamente.`,
      };
    }
  }
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar (typecheck + lint + build)**

Run: `npm run typecheck && npx eslint "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "feat(titulo): action alterarVencimentoTitulo (reagenda + reemite boleto)"
```

---

### Task 2: UI — botão no nível do título

**Files:**
- Create: `src/components/financeiro/AlterarVencimentoTitulo.tsx`
- Modify: `src/components/financeiro/ContasReceber.tsx`
- Test: `src/tests/financeiro/alterar-vencimento-titulo-render.test.tsx`

**Interfaces:**
- Consumes: `alterarVencimentoTitulo` (Task 1); `controleCls`.

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/financeiro/AlterarVencimentoTitulo.tsx
"use client";
import { useState } from "react";
import { alterarVencimentoTitulo } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { controleCls } from "@/components/ui/Campo";

export function AlterarVencimentoTitulo({
  tituloId,
  vencimento,
  onMudou,
}: {
  tituloId: string;
  vencimento: string;
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [novaData, setNovaData] = useState(vencimento);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    setOcupado(true);
    const r = await alterarVencimentoTitulo(tituloId, novaData);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setEditando(false);
    onMudou();
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="ml-2 text-cinza underline"
        onClick={() => {
          setNovaData(vencimento);
          setEditando(true);
        }}
      >
        Alterar vencimento
      </button>
    );
  }
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1">
      <input
        type="date"
        value={novaData}
        onChange={(e) => setNovaData(e.target.value)}
        aria-label="Nova data de vencimento do título"
        className={`${controleCls("compacto")} text-[11px]`}
      />
      <button type="button" onClick={salvar} disabled={ocupado} className="underline">
        Confirmar
      </button>
      <button type="button" onClick={() => setEditando(false)} className="text-cinza-claro underline">
        Cancelar
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Renderizar na linha (`ContasReceber.tsx`)**

Adicionar o import (junto dos outros de componentes):

```tsx
import { AlterarVencimentoTitulo } from "./AlterarVencimentoTitulo";
```

Logo **após** o bloco `{podeCancelarTitulo(status, t.somaBaixado) && (<button …>Cancelar</button>)}` e **antes** do `<div className="mt-1"><BoletoTitulo …/></div>`, inserir:

```tsx
                      {podeCancelarTitulo(status, t.somaBaixado) && (
                        <AlterarVencimentoTitulo
                          tituloId={t.id}
                          vencimento={t.vencimento}
                          onMudou={() =>
                            start(async () => {
                              setTitulos(await listarTitulos(competencia));
                              setBoletos(await listarBoletosDaCompetencia(competencia));
                            })
                          }
                        />
                      )}
```

- [ ] **Step 3: Render test**

```tsx
// src/tests/financeiro/alterar-vencimento-titulo-render.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlterarVencimentoTitulo } from "@/components/financeiro/AlterarVencimentoTitulo";

describe("AlterarVencimentoTitulo", () => {
  it("mostra o botão 'Alterar vencimento'", () => {
    const html = renderToStaticMarkup(
      <AlterarVencimentoTitulo tituloId="t1" vencimento="2026-07-10" onMudou={() => {}} />,
    );
    expect(html).toContain("Alterar vencimento");
  });
});
```

- [ ] **Step 4: Verificar (typecheck + lint + testes + build)**

Run: `npm run typecheck && npx eslint src/components/financeiro/AlterarVencimentoTitulo.tsx src/components/financeiro/ContasReceber.tsx && npx vitest run src/tests/financeiro && npm run build`
Expected: sem erros; o novo render test passa.

- [ ] **Step 5: Commit**

```bash
git add src/components/financeiro/AlterarVencimentoTitulo.tsx src/components/financeiro/ContasReceber.tsx src/tests/financeiro/alterar-vencimento-titulo-render.test.tsx
git commit -m "feat(titulo): botao Alterar vencimento na linha da conta a receber"
```

---

### Task 3: Remover o "Alterar vencimento" do boleto (6.67.0)

**Files:**
- Modify: `src/components/financeiro/BoletoTitulo.tsx`
- Modify: `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`
- Delete: `src/tests/financeiro/alterar-vencimento-render.test.tsx`

**Interfaces:**
- Remove: a action `alterarVencimentoBoleto` e o botão do boleto. `validarNovaVencimento` continua importado (usado por `alterarVencimentoTitulo`).

- [ ] **Step 1: `BoletoTitulo.tsx` — remover estado, handler, imports e o botão**

Trocar o import das actions (tirar `alterarVencimentoBoleto`) e **remover** o import de `controleCls`:

```tsx
import {
  emitirBoleto,
  urlBoletoPdfEquipe,
  cancelarBoleto,
  type BoletoView,
} from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
```

Remover o bloco de estado + handler (as linhas):

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

Trocar todo o bloco `{boleto.status === "emitido" && (<> … </>)}` de volta para:

```tsx
      {boleto.status === "emitido" && (
        <button type="button" onClick={cancelar} className="block text-left text-negativo underline">
          Cancelar boleto
        </button>
      )}
```

- [ ] **Step 2: `boleto-actions.ts` — remover a action `alterarVencimentoBoleto`**

Apagar a função inteira `export async function alterarVencimentoBoleto(…) { … }` (a que foi adicionada no 6.67.0). `emitirBoletoNucleo`, `validarNovaVencimento` e `alterarVencimentoTitulo` permanecem.

- [ ] **Step 3: Apagar o teste do botão do boleto**

```bash
git rm src/tests/financeiro/alterar-vencimento-render.test.tsx
```

- [ ] **Step 4: Verificar (typecheck + lint + testes + build)**

Run: `npm run typecheck && npx eslint src/components/financeiro/BoletoTitulo.tsx "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts" && npx vitest run src/tests/financeiro src/tests/boleto && npm run build`
Expected: sem erros; nenhum import órfão (`validarNovaVencimento` ainda é usado por `alterarVencimentoTitulo`; `controleCls` saiu do `BoletoTitulo`).

- [ ] **Step 5: Commit**

```bash
git add src/components/financeiro/BoletoTitulo.tsx "src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts"
git commit -m "refactor(boleto): remove Alterar vencimento do boleto (substituido pelo do titulo)"
```

---

### Task 4: Release 6.68.0

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`

Produção em 6.67.0. Sem migration.

- [ ] **Step 1: Barra completa**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`
Expected: verde. (Se `format:check` falhar → `npm run format` e recommitar.)

- [ ] **Step 2: Bump (incluir lockfile)**

Run: `npm version minor --no-git-tag-version`
Expected: `6.68.0`. Incluir `package-lock.json` no commit.

- [ ] **Step 3: CHANGELOG (topo, acima de 6.67.0)**

```markdown
## [6.68.0] — 2026-07-22

### Adicionado

- **Alterar vencimento do título.** Conta a receber em aberto ganhou "Alterar vencimento" na própria
  linha: reagenda a data e, se houver boleto ativo, cancela e reemite com a nova data — em um clique.
  Resolve o caso do título vencido sem boleto, que o provedor não deixava emitir com data no passado.

### Alterado

- O "Alterar vencimento" saiu de dentro do boleto e passou para o nível do título (reagenda tudo de
  uma vez, mantendo título e boleto coerentes).
```

- [ ] **Step 4: Teste de versão + suíte**

Run: `npx vitest run src/tests/versao.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit da release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 6.68.0 — alterar vencimento do titulo (substitui o do boleto)"
```

- [ ] **Step 6: Finalizar (PR)**

`git push origin develop` → `gh pr create --base main --head develop` → aguardar as **duas** execuções do `verify` → **não** mergear sem autorização. Após merge (autorizado): sem migration → Implantar → `/api/health` = `6.68.0` → `npm run release:tag` + push da tag → sincronizar `develop` com `main`.

---

## Self-Review

**1. Cobertura do spec:**
- Action reagenda título + reemite boleto se houver (cancelar→reemitir) → Task 1. ✅
- Só título em aberto; `novaData` ≥ hoje/≠ atual → Task 1 (`podeCancelarTitulo` + `validarNovaVencimento`). ✅
- Botão no nível do título, com/sem boleto → Task 2. ✅
- Remoção do botão/action do boleto + teste → Task 3. ✅
- Sem migration; entrega em uma release → Task 4. ✅

**2. Placeholders:** nenhum.

**3. Consistência de tipos:** `alterarVencimentoTitulo(tituloId, novaData)` definido na Task 1 e consumido igual na Task 2 (componente). `emitirBoletoNucleo(supabase, {id,valor,descricao,cliente_id}, vencimento)` reusado com a mesma forma. Ordenação (Task 1/2 antes da 3) garante que remover `alterarVencimentoBoleto` não deixe `validarNovaVencimento` órfão.

**Nota de execução:** smoke manual pós-deploy: (a) título vencido sem boleto → Alterar vencimento → data futura → status vira "Em aberto" e "Emitir boleto" passa a funcionar; (b) título com boleto → Alterar vencimento → boleto novo com a data nova, antigo cancelado.
