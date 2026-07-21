# RNF-01 — Ferramenta de status dos tenants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/tenant-status.mjs` — lista os escritórios do registry, consulta a versão/saúde de cada `/api/health`, sinaliza fora do ar / desatualizado (pós-release) e sai com código ≠ 0 nesses casos.

**Architecture:** Lógica pura em `scripts/_tenant-status.mjs` (semver + classificação), testada por vitest; a CLI faz o `fetch` e imprime.

**Tech Stack:** Node ESM (`scripts/*.mjs`, JS puro fora do `tsc`, coberto por ESLint), Vitest.

## Global Constraints

- Ferramental de operador em `scripts/` (JS, não-tipado, sem lógica de app — CLAUDE.md). Sem migration, sem mudança no app.
- Não imprimir segredos — só metadados do `registry.json` (slug/appUrl) e a `versao` do `/api/health`.
- Rodar `npm run lint` (cobre `scripts/`), `npm test`, `npm run format` antes de commitar; `git add -A` **depois** do `format`.

---

### Task 1: Helper puro `_tenant-status.mjs` + testes

**Files:**
- Create: `scripts/_tenant-status.mjs`
- Test: `src/tests/scripts/tenant-status.test.ts`

**Interfaces:**
- Produces: `compararVersao(a, b): number`; `classificar(health, esperado): string`; `resumo(linhas): { total, fora, desatualizados }`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/tests/scripts/tenant-status.test.ts
import { describe, it, expect } from "vitest";
import { compararVersao, classificar, resumo } from "../../../scripts/_tenant-status.mjs";

describe("compararVersao", () => {
  it("compara semver numericamente", () => {
    expect(compararVersao("6.63.0", "6.62.0")).toBeGreaterThan(0);
    expect(compararVersao("6.62.0", "6.63.0")).toBeLessThan(0);
    expect(compararVersao("6.63.0", "6.63.0")).toBe(0);
  });
  it("tolera prefixo v e comparação de minor de dois dígitos", () => {
    expect(compararVersao("v6.63.0", "6.63.0")).toBe(0);
    expect(compararVersao("6.9.0", "6.10.0")).toBeLessThan(0);
  });
});

describe("classificar", () => {
  it("sem resposta => fora do ar", () => {
    expect(classificar({ ok: false, versao: null }, "6.63.0")).toBe("fora do ar");
  });
  it("versão abaixo do esperado => desatualizado", () => {
    expect(classificar({ ok: true, versao: "6.62.0" }, "6.63.0")).toBe("desatualizado");
  });
  it("versão no esperado (ou acima) => atualizado", () => {
    expect(classificar({ ok: true, versao: "6.63.0" }, "6.63.0")).toBe("atualizado");
  });
  it("sem esperado => ok", () => {
    expect(classificar({ ok: true, versao: "6.63.0" }, null)).toBe("ok");
  });
});

describe("resumo", () => {
  it("conta fora do ar e desatualizados", () => {
    const r = resumo([{ status: "atualizado" }, { status: "fora do ar" }, { status: "desatualizado" }]);
    expect(r).toEqual({ total: 3, fora: 1, desatualizados: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/scripts/tenant-status.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o helper**

```js
// scripts/_tenant-status.mjs
// Lógica pura da ferramenta de status dos tenants (semver + classificação). Sem I/O.

export function compararVersao(a, b) {
  const partes = (v) =>
    String(v ?? "")
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// health = { ok: boolean, versao: string|null }; esperado = string|null.
export function classificar(health, esperado) {
  if (!health.ok) return "fora do ar";
  if (esperado) return compararVersao(health.versao, esperado) < 0 ? "desatualizado" : "atualizado";
  return "ok";
}

export function resumo(linhas) {
  return {
    total: linhas.length,
    fora: linhas.filter((l) => l.status === "fora do ar").length,
    desatualizados: linhas.filter((l) => l.status === "desatualizado").length,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/scripts/tenant-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rnf01): helper puro de status dos tenants + testes"
```

---

### Task 2: CLI `tenant-status.mjs` + script npm

**Files:**
- Create: `scripts/tenant-status.mjs`
- Modify: `package.json` (script `tenant:status`)

- [ ] **Step 1: Escrever a CLI**

```js
// scripts/tenant-status.mjs
// Lista os escritórios do registry e mostra versão/saúde de cada /api/health.
//   npm run tenant:status
//   npm run tenant:status -- --esperado 6.63.0        (sinaliza quem não implantou)
//   npm run tenant:status -- --timeout 5000
// Sai com código 1 se algum tenant estiver fora do ar ou desatualizado.
import { lerRegistry } from "./_tenants.mjs";
import { classificar, resumo } from "./_tenant-status.mjs";

const args = process.argv.slice(2);
const opt = (nome, padrao = null) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
};

const esperado = opt("esperado");
const timeout = Number(opt("timeout", "8000")) || 8000;

function listaEscritorios() {
  const reg = lerRegistry();
  const lista = Array.isArray(reg) ? reg : (reg.escritorios ?? []);
  return lista.filter((e) => e && e.appUrl);
}

async function consultar(appUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, versao: null };
    const j = await res.json().catch(() => ({}));
    return { ok: true, versao: j?.versao ?? null };
  } catch {
    return { ok: false, versao: null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const escritorios = listaEscritorios();
  if (escritorios.length === 0) {
    console.log("Nenhum escritório no registry (tenants/registry.json).");
    return;
  }
  const linhas = await Promise.all(
    escritorios.map(async (e) => {
      const health = await consultar(e.appUrl);
      return { slug: e.slug ?? "—", appUrl: e.appUrl, versao: health.versao ?? "—", status: classificar(health, esperado) };
    }),
  );

  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`${w("SLUG", 16)} ${w("URL", 34)} ${w("VERSÃO", 10)} STATUS`);
  console.log("-".repeat(74));
  for (const l of linhas) console.log(`${w(l.slug, 16)} ${w(l.appUrl, 34)} ${w(l.versao, 10)} ${l.status}`);

  const r = resumo(linhas);
  console.log("-".repeat(74));
  console.log(
    `${r.total} escritório(s)` +
      (esperado ? ` · esperado ${esperado}` : "") +
      ` · fora do ar: ${r.fora} · desatualizados: ${r.desatualizados}`,
  );
  if (r.fora > 0 || r.desatualizados > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Script no package.json**

Adicionar em `scripts`:

```json
    "tenant:status": "node scripts/tenant-status.mjs",
```

- [ ] **Step 3: Verificar sintaxe, lint e suite**

Run: `node --check scripts/tenant-status.mjs && npm run lint && npm test 2>&1 | tail -3`
Expected: sintaxe ok; lint sem erros; todos os testes passam (incl. `tenant-status.test.ts`).

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A
git commit -m "feat(rnf01): CLI tenant:status (versão/saúde por escritório, exit code pós-release)"
```

> **Release:** bump minor + CHANGELOG, PR, `verify` verde, **sem migration**, Implantar (opcional — é ferramental de operador, não muda o app; mas o versionamento sobe), tag, sync. Uso real: após um release, `npm run tenant:status -- --esperado <versao>` lista quem ainda não implantou.

---

## Self-Review

- **Cobertura (spec):** helper puro `compararVersao`/`classificar`/`resumo` + testes (Task 1); CLI que lê o registry, consulta `/api/health` em paralelo, tabela + resumo + exit code, e o script npm (Task 2). A + D atendidos numa ferramenta.
- **Placeholders:** nenhum — código completo.
- **Consistência:** o helper é consumido pela CLI e pelos testes com as mesmas assinaturas; `lerRegistry` reusado de `_tenants.mjs` (tolera array ou `{escritorios}`).
- **Segurança:** nenhum segredo impresso; só slug/appUrl (públicos) e a versão do health.
- **Escopo:** só a ferramenta de status; multi-tenant lógico descartado, B já coberto, C adiado.
