# RF-007 — Fatia C (visibilidade na proposta) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-19-rf007-followup-proposta-design.md`. Fecha a RF-007.
> Depende das Fatias A e B (em produção, v6.19/6.20): config, `proposta.enviada_em`, `followup_envio`.

**Objetivo:** uma seção **"Follow-up"** no editor da proposta (só leitura) — a agenda dos passos (data
prevista) e o que já foi enviado, a partir de `followup_etapa` + `followup_envio`.

**Arquitetura:** lógica pura `agendaFollowup` (testável), um leitor server `carregarAgendaFollowup` e um
componente server `FollowupProposta` (lista), no molde do cartão de contrato da RF-005. Sem migration.

**Stack:** Next.js 16 (server components), Supabase, TypeScript, vitest.

## Global Constraints

- **Sem migration** — lê `proposta` (`status`/`enviada_em`), `followup_etapa` (ativas), `followup_envio`.
- **Só leitura** — a seção não dispara nada (o motor é automático, sem pausa manual).
- **Se a proposta não está `enviada`:** a nota "O follow-up começa quando a proposta for enviada".
- **Situação de cada passo:** `enviado` (com a data), `falhou`, `sem_destino`, `pendente` (venceu e o cron
  ainda não rodou) ou `agendado` (futuro).
- **`FollowupProposta` é server component** (só exibe; sem `"use client"`).
- **Gate:** o do editor de proposta (`podeCriarCliente`), inalterado.
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy só código.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/followup.ts` | **Modificar** — + `agendaFollowup` | 1 |
| `src/tests/comercial/followup.test.ts` | **Modificar** — testes de `agendaFollowup` | 1 |
| `src/app/(app)/comercial/propostas/[id]/followup-status.ts` | **Criar** — `carregarAgendaFollowup` (server) | 2 |
| `src/app/(app)/comercial/propostas/[id]/FollowupProposta.tsx` | **Criar** — seção (server component) | 2 |
| `src/app/(app)/comercial/propostas/[id]/page.tsx` | **Modificar** — carregar + renderizar | 2 |
| `src/tests/comercial/followup-proposta-render.test.tsx` | **Criar** — render | 2 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.21.0 | 3 |

---

### Task 1: `agendaFollowup` (lógica pura)

**Files:**
- Modify: `src/lib/comercial/followup.ts`
- Test: `src/tests/comercial/followup.test.ts`

**Interfaces:**
- Consumes: a `dataDevida` interna (já existe em `followup.ts`).
- Produces:
  - `type EtapaAgenda = { id: string; diasOffset: number }`
  - `type EnvioAgenda = { etapaId: string; enviadoEm: string; status: string }`
  - `type PassoAgenda = { dias: number; dataPrevista: string; situacao: "enviado" | "falhou" | "sem_destino" | "pendente" | "agendado"; quando: string | null }`
  - `agendaFollowup(enviadaEm: string, etapas: EtapaAgenda[], envios: EnvioAgenda[], hoje: string): PassoAgenda[]`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/tests/comercial/followup.test.ts`:
```ts
import { agendaFollowup } from "@/lib/comercial/followup";

describe("agendaFollowup", () => {
  const etapas = [
    { id: "e1", diasOffset: 0 },
    { id: "e2", diasOffset: 3 },
    { id: "e3", diasOffset: 7 },
  ];
  it("mapeia enviado (com data), pendente (venceu, sem envio) e agendado (futuro)", () => {
    const envios = [{ etapaId: "e1", enviadoEm: "2026-07-01T12:00:00Z", status: "enviado" }];
    const r = agendaFollowup("2026-07-01T00:00:00Z", etapas, envios, "2026-07-04");
    expect(r[0]).toEqual({ dias: 0, dataPrevista: "2026-07-01", situacao: "enviado", quando: "2026-07-01" });
    expect(r[1]).toEqual({ dias: 3, dataPrevista: "2026-07-04", situacao: "pendente", quando: null }); // venceu, sem envio
    expect(r[2]).toEqual({ dias: 7, dataPrevista: "2026-07-08", situacao: "agendado", quando: null }); // futuro
  });
  it("reflete sem_destino e falhou do registro", () => {
    const envios = [
      { etapaId: "e1", enviadoEm: "2026-07-01T12:00:00Z", status: "sem_destino" },
      { etapaId: "e2", enviadoEm: "2026-07-04T12:00:00Z", status: "falhou" },
    ];
    const r = agendaFollowup("2026-07-01T00:00:00Z", etapas, envios, "2026-07-10");
    expect(r[0]!.situacao).toBe("sem_destino");
    expect(r[1]!.situacao).toBe("falhou");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/followup.test.ts`
Expected: FAIL — `agendaFollowup` não existe.

- [ ] **Step 3: Implementar**

Acrescentar a `src/lib/comercial/followup.ts` (a `dataDevida` já existe no arquivo; reusar):
```ts
export type EtapaAgenda = { id: string; diasOffset: number };
export type EnvioAgenda = { etapaId: string; enviadoEm: string; status: string };
export type PassoAgenda = {
  dias: number;
  dataPrevista: string;
  situacao: "enviado" | "falhou" | "sem_destino" | "pendente" | "agendado";
  quando: string | null;
};

export function agendaFollowup(
  enviadaEm: string,
  etapas: EtapaAgenda[],
  envios: EnvioAgenda[],
  hoje: string,
): PassoAgenda[] {
  const porEtapa = new Map(envios.map((e) => [e.etapaId, e]));
  return etapas.map((et) => {
    const dataPrevista = dataDevida(enviadaEm, et.diasOffset);
    const envio = porEtapa.get(et.id);
    let situacao: PassoAgenda["situacao"];
    let quando: string | null = null;
    if (envio) {
      if (envio.status === "enviado") {
        situacao = "enviado";
        quando = envio.enviadoEm.slice(0, 10);
      } else if (envio.status === "sem_destino") {
        situacao = "sem_destino";
      } else {
        situacao = "falhou";
      }
    } else if (dataPrevista <= hoje) {
      situacao = "pendente";
    } else {
      situacao = "agendado";
    }
    return { dias: et.diasOffset, dataPrevista, situacao, quando };
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/followup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comercial/followup.ts src/tests/comercial/followup.test.ts
git commit -m "feat(comercial): agendaFollowup (logica pura da agenda de follow-up)"
```

---

### Task 2: Leitor server + seção + integração

**Files:**
- Create: `src/app/(app)/comercial/propostas/[id]/followup-status.ts`
- Create: `src/app/(app)/comercial/propostas/[id]/FollowupProposta.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/page.tsx`
- Test: `src/tests/comercial/followup-proposta-render.test.tsx`

**Interfaces:**
- Consumes: `agendaFollowup`/`PassoAgenda` (Task 1); `formatarData` (`@/lib/format`).
- Produces: `carregarAgendaFollowup(propostaId: string, hoje: string): Promise<{ enviada: boolean; passos: PassoAgenda[] }>`;
  `FollowupProposta({ enviada, passos })`.

- [ ] **Step 1: Leitor server `followup-status.ts`**

```ts
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { agendaFollowup, type PassoAgenda } from "@/lib/comercial/followup";

export async function carregarAgendaFollowup(
  propostaId: string,
  hoje: string,
): Promise<{ enviada: boolean; passos: PassoAgenda[] }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { enviada: false, passos: [] };
  const supabase = await createServerSupabase();

  const { data: pr } = await supabase
    .from("proposta")
    .select("status, enviada_em")
    .eq("id", propostaId)
    .maybeSingle();
  const enviadaEm = pr?.enviada_em as string | null;
  if (pr?.status !== "enviada" || !enviadaEm) return { enviada: false, passos: [] };

  const { data: etRaw } = await supabase
    .from("followup_etapa")
    .select("id, dias_offset, ordem")
    .eq("ativa", true)
    .order("ordem");
  const etapas = (etRaw ?? []).map((e) => ({ id: e.id as string, diasOffset: e.dias_offset as number }));

  const { data: envRaw } = await supabase
    .from("followup_envio")
    .select("etapa_id, enviado_em, status")
    .eq("proposta_id", propostaId);
  const envios = (envRaw ?? []).map((e) => ({
    etapaId: e.etapa_id as string,
    enviadoEm: e.enviado_em as string,
    status: e.status as string,
  }));

  return { enviada: true, passos: agendaFollowup(enviadaEm, etapas, envios, hoje) };
}
```

- [ ] **Step 2: Teste de render**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FollowupProposta } from "@/app/(app)/comercial/propostas/[id]/FollowupProposta";
import type { PassoAgenda } from "@/lib/comercial/followup";

const passos: PassoAgenda[] = [
  { dias: 0, dataPrevista: "2026-07-01", situacao: "enviado", quando: "2026-07-01" },
  { dias: 3, dataPrevista: "2026-07-04", situacao: "pendente", quando: null },
  { dias: 7, dataPrevista: "2026-07-08", situacao: "agendado", quando: null },
];

describe("FollowupProposta", () => {
  it("mostra a agenda quando enviada", () => {
    const html = renderToStaticMarkup(<FollowupProposta enviada passos={passos} />);
    expect(html).toContain("Follow-up");
    expect(html).toContain("D+0");
    expect(html).toContain("D+3");
    expect(html).toContain("Enviado");
  });
  it("nota quando não enviada", () => {
    const html = renderToStaticMarkup(<FollowupProposta enviada={false} passos={[]} />);
    expect(html).toContain("O follow-up começa quando a proposta for enviada");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/followup-proposta-render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Componente `FollowupProposta` (server)**

Server component (sem `"use client"`). Props: `enviada: boolean`, `passos: PassoAgenda[]`. Cartão
`rounded-2xl border border-linha bg-white p-4`:
- Título **"Follow-up"**.
- Se **não** `enviada`: `<p>` "O follow-up começa quando a proposta for enviada."
- Senão, se `passos.length === 0`: "Nenhuma etapa de follow-up configurada."
- Senão, uma lista — cada passo: um rótulo **`D+{dias}`**, a data prevista (`formatarData(dataPrevista)`) e
  o status por extenso via um mapa local:
  ```ts
  const ROTULO: Record<PassoAgenda["situacao"], string> = {
    enviado: "Enviado", falhou: "Falhou", sem_destino: "Sem contato", pendente: "Pendente", agendado: "Agendado",
  };
  ```
  Para `enviado`, mostrar também `quando` (`— em {formatarData(quando)}`). Cor semântica: `enviado`→verde,
  `falhou`/`sem_destino`→negativo/atenção, `pendente`→cinza, `agendado`→cinza-claro. Usar `import { formatarData } from "@/lib/format"`.

- [ ] **Step 5: Integrar no `[id]/page.tsx`**

Após o `<ContratoHonorarios .../>`, carregar a agenda e renderizar:
```tsx
import { carregarAgendaFollowup } from "./followup-status";
import { FollowupProposta } from "./FollowupProposta";
// ...
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const agenda = await carregarAgendaFollowup(proposta.id, hoje);
// ...no JSX, após o cartão de contrato:
  <FollowupProposta enviada={agenda.enviada} passos={agenda.passos} />
```

- [ ] **Step 6: Rodar e verificar**

Run: `npx vitest run src/tests/comercial/followup-proposta-render.test.tsx && npm run typecheck && npm run lint`
Expected: PASS + limpo.

- [ ] **Step 7: Conferência na tela** — `npm run dev`: com o follow-up ligado e etapas configuradas, abrir
  uma proposta `enviada` — ver a agenda; marcar como rascunho → ver a nota. **Mostrar ao Pedro.**

- [ ] **Step 8: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): secao Follow-up na proposta (agenda + historico)"
```

---

### Task 3: Release 6.21.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.20.0` → `6.21.0`.
- `CHANGELOG.md`: `## [6.21.0] — <data>` com `### Adicionado` (a seção Follow-up na proposta: agenda dos
  passos + histórico dos envios). **Fecha a RF-007** (e o domínio Comercial do artifact).
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-007 fatia C: visibilidade do follow-up na proposta (v6.21.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Sem migration.** Sequência: merge → **Implantar** → confirmar `6.21.0` no `/api/health` → **tag**.

## Self-Review (cobertura da spec)

- `agendaFollowup` (enviado/pendente/agendado/sem_destino/falhou; data prevista) → Task 1.
- Leitor: só `enviada` com `enviada_em`; etapas ativas + envios → Task 2.
- Seção read-only: nota quando não enviada; agenda por etapa com status → Task 2.
- Sem migration → nenhuma tarefa de banco. Fecha a RF-007.
