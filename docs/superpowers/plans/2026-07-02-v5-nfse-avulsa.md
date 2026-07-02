# V5-A — NFS-e avulsa (serviço extra) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir emitir mais de uma NFS-e por cliente/competência pela ficha (nota avulsa/serviço extra), com valor e descrição próprios, sem quebrar o lote da nota recorrente.

**Architecture:** `emitirNfseCliente` ganha um parâmetro `opcoes` (valor/descrição/avulsa); a trava anti-duplicidade vale só para a recorrente (`avulsa=false`); o formulário da ficha ganha valor editável, descrição e um checkbox "nota avulsa"; o lote e a marcação "já emitida" passam a olhar só recorrentes.

**Tech Stack:** Next 16 (App Router, server actions) + TypeScript · Supabase · Vitest. Reusa `src/lib/nfse/*`.

## Global Constraints

- **RBAC:** emissão gated por `podeVerHonorario(papel)` (admin/financeiro/contador-dono).
- **Recorrente = `avulsa=false`** (a nota do honorário; o lote emite estas). **Avulsa = `avulsa=true`** (serviço extra, individual pela ficha).
- **Anti-duplicidade só na recorrente:** bloqueia 2ª nota `avulsa=false` autorizada na mesma competência+ambiente; avulsa nunca é bloqueada.
- **Banco:** migration idempotente via `npm run db:migrate`; migrations aplicadas são imutáveis.
- **Comandos antes de commitar:** `npm run lint && npm run typecheck && npm test`. Da raiz, na branch `develop`.

---

## File Structure

- `supabase/migrations/0022_nfse_avulsa.sql` (criar) — coluna `nfse.avulsa`.
- `src/app/(app)/clientes/[id]/nfse.ts` (modificar) — `emitirNfseCliente` com `opcoes`; `emitirNfse` lê valor/descrição/avulsa; `listarElegiveisLote` marca já_emitida só por recorrente.
- `src/components/nfse/EmitirNfse.tsx` (modificar) — valor editável + descrição + checkbox avulsa.
- `src/components/nfse/NotasFiscaisSection.tsx` (modificar) — trazer `avulsa` e exibir rótulo.

---

## Task 1: Migration 0022 — coluna `avulsa`

**Files:** Create `supabase/migrations/0022_nfse_avulsa.sql`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0022_nfse_avulsa.sql — NFS-e avulsa (serviço extra). Idempotente.
alter table nfse add column if not exists avulsa boolean not null default false;
```

- [ ] **Step 2: Aplicar** — Run: `npm run db:migrate` · Expected: `0022_nfse_avulsa.sql` aplicada.
- [ ] **Step 3: Reaplicar é no-op** — Run: `npm run db:migrate` · Expected: 0 novas.
- [ ] **Step 4: RLS ainda passa** (sem policy nova) — Run: `npm run db:test` · Expected: `✓ TODOS OS ASSERTS PASSARAM`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0022_nfse_avulsa.sql
git commit -m "feat(db): coluna nfse.avulsa (serviço extra)"
```

---

## Task 2: `emitirNfseCliente` com opções (valor/descrição/avulsa)

**Files:** Modify `src/app/(app)/clientes/[id]/nfse.ts`.

**Interfaces:**
- Produces `type OpcoesEmissao = { valor?: number; descricao?: string; avulsa?: boolean }`; `emitirNfseCliente(clienteId: string, competencia: string, opcoes?: OpcoesEmissao): Promise<ResultadoCliente>`.
- `emitirNfse` (FormData) passa a ler `valor`, `descricao`, `avulsa`.

- [ ] **Step 1: Tipo `OpcoesEmissao`** — no topo de `nfse.ts`, após `EstadoNfse`, adicionar:

```ts
export type OpcoesEmissao = { valor?: number; descricao?: string; avulsa?: boolean };
```

- [ ] **Step 2: Assinatura + valor/avulsa** — em `emitirNfseCliente`, trocar a assinatura e o cálculo do valor. Substituir:

```ts
export async function emitirNfseCliente(clienteId: string, competencia: string): Promise<ResultadoCliente> {
```

por:

```ts
export async function emitirNfseCliente(
  clienteId: string,
  competencia: string,
  opcoes?: OpcoesEmissao,
): Promise<ResultadoCliente> {
```

E substituir o bloco do honorário:

```ts
  const honorario = Number(fin?.honorario_mensal ?? 0);
  if (!honorario || honorario <= 0) return { status: "pulada", motivo: "Sem honorário." };
```

por:

```ts
  const honorario = Number(fin?.honorario_mensal ?? 0);
  const avulsa = opcoes?.avulsa ?? false;
  const valor = opcoes?.valor && opcoes.valor > 0 ? opcoes.valor : honorario;
  if (!valor || valor <= 0) return { status: "pulada", motivo: "Sem valor/honorário." };
```

- [ ] **Step 3: Anti-duplicidade só na recorrente** — substituir o bloco:

```ts
  const ambiente: "homologacao" | "producao" = cfg.ambiente === "producao" ? "producao" : "homologacao";
  const { data: existente } = await supabase
    .from("nfse")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .eq("ambiente", ambiente)
    .maybeSingle();
  if (existente) return { status: "pulada", motivo: "Já emitida nesta competência." };
```

por:

```ts
  const ambiente: "homologacao" | "producao" = cfg.ambiente === "producao" ? "producao" : "homologacao";
  if (!avulsa) {
    // Trava só na recorrente: uma avulsa (serviço extra) não bloqueia.
    const { data: existente } = await supabase
      .from("nfse")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("competencia", competencia)
      .eq("status", "autorizada")
      .eq("ambiente", ambiente)
      .eq("avulsa", false)
      .maybeSingle();
    if (existente) return { status: "pulada", motivo: "Já emitida nesta competência." };
  }
```

- [ ] **Step 4: Descrição custom** — no `config: ConfigFiscal`, trocar a linha `descricaoServico`:

```ts
    descricaoServico: cfg.descricao_servico ?? "Honorarios",
```

por:

```ts
    descricaoServico: opcoes?.descricao?.trim() || cfg.descricao_servico || "Honorarios",
```

- [ ] **Step 5: Valor + avulsa na montagem/insert** — trocar `montarDps({ config, tomador, valor: honorario, ... })` por `valor`:

```ts
  const { xml, idDps } = montarDps({ config, tomador, valor, competencia, serie: "1", numeroDps });
```

E nos **dois** inserts em `nfse` (o do catch de erro e o final), trocar `valor: honorario,` por `valor,` e acrescentar `avulsa,`. Insert do catch:

```ts
    await supabase.from("nfse").insert({
      cliente_id: clienteId,
      valor,
      competencia,
      status: "erro",
      dps_xml: assinado,
      ambiente,
      avulsa,
      mensagens: [{ descricao: "Falha de comunicação" }],
    });
```

Insert final:

```ts
  await supabase.from("nfse").insert({
    cliente_id: clienteId,
    valor,
    competencia,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    dps_xml: assinado,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    ambiente,
    avulsa,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
```

- [ ] **Step 6: `emitirNfse` lê os campos** — substituir o corpo de `emitirNfse` por:

```ts
export async function emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse> {
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };
  const valorRaw = Number(formData.get("valor") ?? 0);
  const descricao = String(formData.get("descricao") ?? "").trim();
  const r = await emitirNfseCliente(clienteId, competencia, {
    valor: valorRaw > 0 ? valorRaw : undefined,
    descricao: descricao || undefined,
    avulsa: formData.get("avulsa") === "on",
  });
  revalidatePath(`/clientes/${clienteId}`);
  if (r.status === "autorizada") return { ok: true };
  return { erro: r.motivo ?? "Não foi possível emitir." };
}
```

- [ ] **Step 7: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde.
- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat(nfse): emitirNfseCliente com opções (valor/descrição/avulsa)"
```

---

## Task 3: Lote ignora avulsas ao marcar "já emitida"

**Files:** Modify `src/app/(app)/clientes/[id]/nfse.ts` (função `listarElegiveisLote`).

- [ ] **Step 1: Filtrar por recorrente** — no `listarElegiveisLote`, na query das notas autorizadas, acrescentar `.eq("avulsa", false)`:

```ts
  const { data: notas } = await supabase
    .from("nfse")
    .select("cliente_id")
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .eq("ambiente", ambiente)
    .eq("avulsa", false);
```

- [ ] **Step 2: Verificar** — Run: `npm run lint && npm run typecheck` · Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/nfse.ts"
git commit -m "feat(nfse): lote considera só recorrentes ao marcar já-emitida"
```

---

## Task 4: UI — valor editável, descrição e checkbox avulsa

**Files:** Modify `src/components/nfse/EmitirNfse.tsx`, `src/components/nfse/NotasFiscaisSection.tsx`.

- [ ] **Step 1: Form da ficha** — em `EmitirNfse.tsx`, substituir o parágrafo do valor fixo:

```tsx
      <p>
        Valor (honorário): <strong>R$ {honorario.toFixed(2)}</strong>
      </p>
```

por os campos editáveis (valor pré-preenchido, descrição, avulsa):

```tsx
      <label className="block">
        Valor (R$)
        <input
          type="number"
          name="valor"
          step="0.01"
          min="0"
          defaultValue={honorario.toFixed(2)}
          required
          className="ml-2 w-32 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="block">
        Descrição do serviço
        <input
          name="descricao"
          placeholder="Honorarios"
          className="ml-2 w-64 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="avulsa" />
        Nota avulsa (serviço extra) — não conta como a recorrente do mês
      </label>
```

- [ ] **Step 2: Exibir rótulo "avulsa" na lista** — em `NotasFiscaisSection.tsx`, acrescentar `avulsa` ao `.select`:

```tsx
      .select("id, competencia, status, numero, valor, chave_acesso, mensagens, ambiente, avulsa")
```

e, na célula de status (logo após o selo de homologação), adicionar:

```tsx
                    {n.avulsa && (
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        avulsa
                      </span>
                    )}
```

- [ ] **Step 3: Verificar** — Run: `npm run lint && npm run typecheck && npm run build` · Expected: verde.
- [ ] **Step 4: Commit**

```bash
git add src/components/nfse/EmitirNfse.tsx src/components/nfse/NotasFiscaisSection.tsx
git commit -m "feat(nfse): ficha com valor editável, descrição e nota avulsa"
```

---

## Task 5: Verificação E2E e release

**Files:** nenhuma (verificação).

- [ ] **Step 1: Suíte completa** — Run: `npm run lint && npm run typecheck && npm test && npm run db:test` · Expected: verde.
- [ ] **Step 2: E2E** — numa ficha de cliente com honorário: (a) emitir a **recorrente** (sem marcar avulsa) → autoriza; (b) tentar emitir outra recorrente na mesma competência → bloqueia ("Já emitida"); (c) emitir uma **avulsa** (marcar o checkbox, valor/descrição próprios) → autoriza; (d) abrir `/nfse/lote` na mesma competência e confirmar que um cliente que só tem avulsa aparece **apto**, e um que já tem a recorrente aparece **"Já emitida"**.
- [ ] **Step 3:** Atualizar `CHANGELOG.md` (v5.3.0) e finalizar a branch (merge + tag `v5.3.0`).

---

## Self-Review (resultado)

- **Cobertura do spec:** §3 dados → T1; §4 motor (opções, valor, descrição, anti-dup por avulsa) → T2; §5 UI → T4; §6 lote → T3; §7 erros (valor≤0, trava recorrente, avulsa livre) → T2; §8 testes → T5 (E2E).
- **Placeholders:** sem TODO/TBD; código completo em cada passo.
- **Consistência de tipos:** `OpcoesEmissao` (T2) usado por `emitirNfseCliente` e `emitirNfse`; o lote chama `emitirNfseCliente(clienteId, competencia)` sem opções (recorrente) — inalterado; `nfse.avulsa` (T1) lido/gravado em T2/T3/T4.
- **Reuso:** nada duplicado; o motor de emissão é o mesmo, só parametrizado.
