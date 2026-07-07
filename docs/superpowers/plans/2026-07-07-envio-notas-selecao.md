# Envio de notas — seleção de lote determinado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escolher (checkboxes) quais notas enviar, mostrando quais já foram enviadas e pré-marcando só as pendentes.

**Architecture:** `listarNotasParaEnvio` passa a indicar `jaEnviada` por nota; o painel `EnviarNotasWhatsapp` vira uma lista com seleção (busca, selecionar todas/limpar, "Enviar selecionadas"); helper puro `preSelecionadas`. Spec: `docs/superpowers/specs/2026-07-07-envio-notas-selecao-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos passam.
- Sem migration. `enviarNotaWhatsapp` inalterado (dedup por `ENVIADO` como rede de segurança).
- Tokens SALDO na UI. Branch: `git checkout -b feat/envio-notas-selecao develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/lib/whatsapp/notas-envio.ts` — **modificar**: helper `preSelecionadas`.
- `src/tests/whatsapp/notas-envio.test.ts` — **modificar**: testes do helper.
- `src/app/(app)/nfse/lote/envio.ts` — **modificar**: `listarNotasParaEnvio` retorna `jaEnviada`.
- `src/components/nfse/EnviarNotasWhatsapp.tsx` — **modificar**: lista com seleção.

---

## Task 1: `jaEnviada` na action + helper `preSelecionadas` (TDD)

**Files:**
- Modify: `src/lib/whatsapp/notas-envio.ts`
- Modify: `src/app/(app)/nfse/lote/envio.ts`
- Test: `src/tests/whatsapp/notas-envio.test.ts`

**Interfaces:**
- Produces:
  - `preSelecionadas(notas: { nfseId: string; jaEnviada: boolean }[]): Set<string>`.
  - `listarNotasParaEnvio(competencia): Promise<{ nfseId: string; razaoSocial: string; jaEnviada: boolean }[]>`.

- [ ] **Step 1: Escrever os testes do helper**

Adicionar ao final de `src/tests/whatsapp/notas-envio.test.ts` (importar `preSelecionadas` no topo):

```ts
describe("preSelecionadas", () => {
  it("marca só as pendentes (jaEnviada false)", () => {
    const s = preSelecionadas([
      { nfseId: "a", jaEnviada: false },
      { nfseId: "b", jaEnviada: true },
      { nfseId: "c", jaEnviada: false },
    ]);
    expect([...s].sort()).toEqual(["a", "c"]);
  });
  it("todas enviadas → vazio", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: true }]).size).toBe(0);
  });
  it("nenhuma enviada → todas", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: false }, { nfseId: "b", jaEnviada: false }]).size).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- notas-envio`
Expected: FAIL (`preSelecionadas` inexistente).

- [ ] **Step 3: Implementar `preSelecionadas` em `notas-envio.ts`**

Adicionar ao final:
```ts
// nfseIds das notas ainda não enviadas (para pré-marcar na seleção).
export function preSelecionadas(notas: { nfseId: string; jaEnviada: boolean }[]): Set<string> {
  return new Set(notas.filter((n) => !n.jaEnviada).map((n) => n.nfseId));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- notas-envio`
Expected: PASS.

- [ ] **Step 5: `listarNotasParaEnvio` retorna `jaEnviada`**

Em `src/app/(app)/nfse/lote/envio.ts`, substituir a função por:
```ts
export async function listarNotasParaEnvio(
  competencia: string,
): Promise<{ nfseId: string; razaoSocial: string; jaEnviada: boolean }[]> {
  if (!(await gate())) return [];
  const notas = await listarNotasAutorizadasPorCompetencia(competencia);
  if (notas.length === 0) return [];
  const admin = createAdminSupabase();
  const ids = notas.map((n) => n.nfseId);
  const { data: enviadasRows } = await admin
    .from("whatsapp_mensagem")
    .select("nfse_id")
    .eq("status", "ENVIADO")
    .in("nfse_id", ids);
  const enviadas = new Set((enviadasRows ?? []).map((r) => r.nfse_id as string));
  return notas.map((n) => ({ nfseId: n.nfseId, razaoSocial: n.razaoSocial, jaEnviada: enviadas.has(n.nfseId) }));
}
```
(`createAdminSupabase` já é importado no arquivo.)

- [ ] **Step 6: Verificar + commit**

Run: `npm run lint && npm run typecheck`
Expected: sem erros no `notas-envio.ts` e no `envio.ts`. (O `EnviarNotasWhatsapp` ainda usa o tipo antigo de `Nota` → o `tsc` pode acusar; corrigido no Task 2. Para este commit, `npm test -- notas-envio` verde basta.)

```bash
git add src/lib/whatsapp/notas-envio.ts src/tests/whatsapp/notas-envio.test.ts "src/app/(app)/nfse/lote/envio.ts"
git commit -m "feat(cobranca): listarNotasParaEnvio indica jaEnviada + helper preSelecionadas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: UI — lista com seleção

**Files:**
- Modify: `src/components/nfse/EnviarNotasWhatsapp.tsx`

**Interfaces:**
- Consumes: `preSelecionadas` (Task 1); `listarNotasParaEnvio` (com `jaEnviada`, Task 1); `enviarNotaWhatsapp` (inalterado).

- [ ] **Step 1: Reescrever `EnviarNotasWhatsapp.tsx`**

Substituir todo o conteúdo por:
```tsx
"use client";
import { useRef, useState } from "react";
import { listarNotasParaEnvio, enviarNotaWhatsapp } from "@/app/(app)/nfse/lote/envio";
import { preSelecionadas } from "@/lib/whatsapp/notas-envio";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Nota = { nfseId: string; razaoSocial: string; jaEnviada: boolean };

export function EnviarNotasWhatsapp() {
  const [mes, setMes] = useState("");
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, pulados: 0, erros: 0 });
  const [falhas, setFalhas] = useState<Nota[]>([]);
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  const visiveis = (notas ?? []).filter((n) => n.razaoSocial.toLowerCase().includes(busca.trim().toLowerCase()));

  async function verificar() {
    if (!competencia) return;
    setCarregando(true);
    setNotas(null);
    setFalhas([]);
    setBusca("");
    const lista = await listarNotasParaEnvio(competencia);
    setNotas(lista);
    setSelecionadas(preSelecionadas(lista));
    setCarregando(false);
  }

  function alternar(id: string) {
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selecionarVisiveis(marcar: boolean) {
    setSelecionadas((s) => {
      const n = new Set(s);
      for (const v of visiveis) marcar ? n.add(v.nfseId) : n.delete(v.nfseId);
      return n;
    });
  }

  async function enviar(alvo: Nota[]) {
    if (alvo.length === 0) return;
    if (!confirm(`Enviar a NFS-e + cobrança para ${alvo.length} cliente(s) por WhatsApp?`)) return;
    setEnviando(true);
    pararRef.current = false;
    setFalhas([]);
    setProg({ feitas: 0, total: alvo.length, ok: 0, pulados: 0, erros: 0 });
    const falhou: Nota[] = [];
    for (const n of alvo) {
      if (pararRef.current) break;
      const r = await enviarNotaWhatsapp(n.nfseId);
      if (r.status === "erro") falhou.push(n);
      setProg((p) => ({
        feitas: p.feitas + 1,
        total: p.total,
        ok: p.ok + (r.status === "ok" ? 1 : 0),
        pulados: p.pulados + (r.status === "pulado" ? 1 : 0),
        erros: p.erros + (r.status === "erro" ? 1 : 0),
      }));
      await sleep(400);
    }
    setFalhas(falhou);
    setEnviando(false);
  }

  const selecionadasList = (notas ?? []).filter((n) => selecionadas.has(n.nfseId));

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Enviar notas + cobrança do mês (WhatsApp)</h2>
        <p className="text-xs text-cinza">
          Escolha as notas e envie a cada cliente a NFS-e (PDF) + os dados de pagamento (PIX/TED). Configure em{" "}
          <strong>Configurações → Dados de pagamento</strong>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-cinza">
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setNotas(null);
              setFalhas([]);
            }}
            className="ml-2 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto focus:border-verde"
          />
        </label>
        <Botao variante="secundario" onClick={verificar} disabled={!competencia || carregando || enviando}>
          {carregando ? "Verificando…" : "Verificar"}
        </Botao>
        {notas !== null && !enviando && (
          <Botao variante="primario" onClick={() => enviar(selecionadasList)} disabled={selecionadas.size === 0}>
            Enviar {selecionadas.size} selecionada(s)
          </Botao>
        )}
        {enviando && (
          <>
            <span className="text-cinza">
              Enviando {prog.feitas}/{prog.total}… (✓ {prog.ok} · ⤼ {prog.pulados} · ✗ {prog.erros})
            </span>
            <Botao variante="fantasma" onClick={() => (pararRef.current = true)}>
              Parar
            </Botao>
          </>
        )}
      </div>

      {notas !== null && !enviando && (
        <>
          {notas.length === 0 ? (
            <p className="text-cinza-claro">Nenhuma nota autorizada nessa competência.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por razão social…"
                  className="flex-1 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm focus:border-verde"
                />
                <button onClick={() => selecionarVisiveis(true)} className="text-xs text-cinza underline">
                  Selecionar todas
                </button>
                <button onClick={() => selecionarVisiveis(false)} className="text-xs text-cinza underline">
                  Limpar
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-linha">
                {visiveis.map((n) => (
                  <label
                    key={n.nfseId}
                    className="flex cursor-pointer items-center gap-2 border-b border-linha/60 px-3 py-2 last:border-b-0 hover:bg-creme"
                  >
                    <input
                      type="checkbox"
                      checked={selecionadas.has(n.nfseId)}
                      onChange={() => alternar(n.nfseId)}
                      className="accent-verde"
                    />
                    <span className="flex-1 truncate text-texto">{n.razaoSocial}</span>
                    {n.jaEnviada && (
                      <span className="shrink-0 rounded bg-verde/10 px-2 py-0.5 text-[10px] font-medium text-verde">
                        já enviada
                      </span>
                    )}
                  </label>
                ))}
                {visiveis.length === 0 && <p className="px-3 py-2 text-cinza-claro">Nenhuma nota com esse filtro.</p>}
              </div>
            </div>
          )}
        </>
      )}

      {falhas.length > 0 && !enviando && (
        <div className="space-y-2 rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
          <p className="font-medium">{falhas.length} não enviada(s) (erro). Reenvie para tentar de novo:</p>
          <ul className="list-disc pl-4">
            {falhas.map((n) => (
              <li key={n.nfseId}>{n.razaoSocial}</li>
            ))}
          </ul>
          <Botao variante="primario" onClick={() => enviar(falhas)}>
            Reenviar as {falhas.length} que falharam
          </Botao>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; smoke `enviar-notas-render` continua passando; rota `/nfse/lote` compila.

- [ ] **Step 3: Verificação visual (opcional)**

`npm run dev` → `/nfse/lote`: Verificar mostra a lista com checkboxes + selo "já enviada"; pré-marca só as pendentes; busca filtra; "Enviar N selecionada(s)" dispara só as marcadas.

- [ ] **Step 4: Commit**

```bash
git add src/components/nfse/EnviarNotasWhatsapp.tsx
git commit -m "feat(cobranca): seleção de notas (checkbox + já enviada + busca) no envio em lote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG**

Ajustar a linha existente do envio de notas (sob `### Adicionado`) para mencionar a seleção — substituir:
```markdown
- **Cobrança — envio de notas + PIX/TED (WhatsApp):** na tela de NFS-e em lote, botão "Enviar notas +
  cobrança do mês" dispara, por cliente, a NFS-e (PDF) + a mensagem com dados de pagamento (PIX/TED),
  com progresso e reenvio das falhas; não reenvia quem já recebeu e respeita o opt-out de cobrança.
  Dados bancários configuráveis em Configurações → Dados de pagamento.
```
por:
```markdown
- **Cobrança — envio de notas + PIX/TED (WhatsApp):** na tela de NFS-e em lote, o painel lista as NFS-e
  autorizadas com seleção por caixas (selo "já enviada", pré-marcando só as pendentes) e busca; envia às
  selecionadas a NFS-e (PDF) + a mensagem com dados de pagamento (PIX/TED), com progresso e reenvio das
  falhas; não reenvia quem já recebeu e respeita o opt-out. Dados bancários em Configurações → Dados de
  pagamento.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog da seleção de notas no envio em lote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar `superpowers:finishing-a-development-branch`.

---

## Self-Review

- **Cobertura do spec:** `listarNotasParaEnvio` com `jaEnviada` (T1) ✓; `preSelecionadas` (T1) ✓; UI lista com checkbox + selo + busca + selecionar todas/limpar + "Enviar selecionadas" + progresso/reenvio (T2) ✓; teste unit do helper (T1) + smoke (T2) ✓; CHANGELOG (T3) ✓. Sem migration (correto).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `Nota = { nfseId; razaoSocial; jaEnviada }` no componente casa com o retorno de `listarNotasParaEnvio` (T1); `preSelecionadas` recebe `{ nfseId; jaEnviada }[]` e devolve `Set<string>`, consumido no `verificar`; `enviarNotaWhatsapp` inalterado (retorno `{ status }`).
- **Nota de sequência:** após o T1 o `tsc` pode acusar o `Nota` antigo no componente; fecha no T2. O commit do T1 roda `npm test -- notas-envio` (verde); typecheck/build completos valem do T2 em diante.
