# Onboarding — Ciclo B: write-back, dependências e anexo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao processo de onboarding: gravação da competência inicial no cadastro ao concluir (campo_destino), dependências entre itens (depende_de) e anexo obrigatório com upload.

**Architecture:** Migration com colunas novas + backfill; tipos/seed/materialização estendidos; helper puro de bloqueio de conclusão; enforce nas actions + write-back + anexo no Storage (padrão documentos); UI com dependências, competência e anexo. Spec: `docs/superpowers/specs/2026-07-08-onboarding-ciclo-b-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (Postgres/RLS/Storage), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck` (SEM `| tail`), `npm test`, `npm run build`. Todos passam.
- Migration idempotente (`add column if not exists`; updates determinísticos), aplicada por `npm run db:migrate`. Sem novos enums.
- Storage: bucket `documentos` via `createAdminSupabase()`; ler o item pela sessão (RLS) antes de operar o Storage. TIPOS_OK = pdf/png/jpeg; máx 10 MB; `createSignedUrl(path, 60)` para baixar.
- Gate: `podeCriarCliente` (gerenciar processo/anexo), `podeGerenciarModeloOnboarding` (template).
- `competencia_inicial` gravada como `${valorDestino}-01` (valorDestino é "YYYY-MM").
- Tokens SALDO na UI. Branch: `git checkout -b feat/onboarding-ciclo-b develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0051_onboarding_ciclo_b.sql` — **novo**: colunas + `clientes.competencia_inicial` + backfill.
- `src/lib/onboarding/template-seed.ts` — **modificar**: `dependeDe`/`campoDestino` nos itens.
- `src/lib/onboarding/processo.ts` — **modificar**: tipos ampliados + `materializarProcesso` + `motivosBloqueioConclusao`.
- `src/tests/onboarding/processo.test.ts` — **modificar**: testes do helper + seed dos novos campos.
- `src/app/(app)/clientes/[id]/processo.ts` — **modificar**: view ampliada, enforce, write-back, anexo.
- `src/app/(app)/onboarding/template-actions.ts` — **modificar**: `dependeDe`/`campoDestino`.
- `src/components/onboarding/ProcessoSection.tsx` — **modificar**: dependências, competência, anexo.
- `src/tests/onboarding/processo-section-render.test.tsx` — **modificar**: novos campos no mock.
- `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx` — **modificar**: editar `dependeDe`/`campoDestino`.
- `src/app/(app)/clientes/[id]/page.tsx` — **modificar**: exibir competência inicial.

---

## Task 1: Migration — colunas + competência inicial + backfill

**Files:**
- Create: `supabase/migrations/0051_onboarding_ciclo_b.sql`

- [ ] **Step 1: Criar a migration** (copiar o bloco SQL da seção "Dados" do spec, íntegro)

- [ ] **Step 2: Aplicar + verificar**

Run: `npm run db:migrate`
Then:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const col=await c.query(\"select 1 from information_schema.columns where table_name='clientes' and column_name='competencia_inicial'\");console.log('clientes.competencia_inicial:',col.rowCount);const bf=await c.query(\"select codigo, campo_destino, depende_de from onboarding_template_item ti join onboarding_bloco b on b.id=ti.bloco_id join onboarding_template t on t.id=b.template_id where t.slug='onboarding-cliente-existente' and ti.codigo in ('1.3','6.1','6.2','6.3') order by codigo\");console.table(bf.rows);await c.end();});"
```
Expected: `clientes.competencia_inicial: 1`; 1.3 → campo_destino `competencia_inicial`; 6.1 → `{4.6}`; 6.2 → `{1.3,2.5}`; 6.3 → `{1.1}`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0051_onboarding_ciclo_b.sql
git commit -m "feat(onboarding): colunas depende_de/campo_destino/anexo + competencia_inicial + backfill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Tipos + seed + materializar + helper de bloqueio (TDD)

**Files:**
- Modify: `src/lib/onboarding/processo.ts`
- Modify: `src/lib/onboarding/template-seed.ts`
- Test: `src/tests/onboarding/processo.test.ts`

**Interfaces:**
- Produces: `TemplateItem`/`ProcessoItemSeed` com `dependeDe: string[]` e `campoDestino: string | null`; `motivosBloqueioConclusao(item, itens): string[]`.

- [ ] **Step 1: Estender os tipos e `materializarProcesso` em `processo.ts`**

Em `TemplateItem`, adicionar `dependeDe: string[]; campoDestino: string | null;` (após `ordem`).
Em `ProcessoItemSeed`, adicionar `dependeDe: string[]; campoDestino: string | null;`.
Em `materializarProcesso`, no objeto `out.push({...})`, adicionar `dependeDe: i.dependeDe, campoDestino: i.campoDestino,`.

- [ ] **Step 2: Adicionar `motivosBloqueioConclusao` em `processo.ts`**

```ts
export function motivosBloqueioConclusao(
  item: { dependeDe: string[]; anexoObrigatorio: boolean; temAnexo: boolean; campoDestino: string | null; temValorDestino: boolean },
  itens: { codigo: string | null; status: StatusItem }[],
): string[] {
  const motivos: string[] = [];
  for (const dep of item.dependeDe) {
    const irmao = itens.find((i) => i.codigo === dep);
    const ok = irmao && (irmao.status === "concluido" || irmao.status === "dispensado");
    if (!ok) motivos.push(`Depende de ${dep}`);
  }
  if (item.anexoObrigatorio && !item.temAnexo) motivos.push("Anexo obrigatório pendente");
  if (item.campoDestino && !item.temValorDestino) motivos.push("Informe o valor (competência inicial)");
  return motivos;
}
```

- [ ] **Step 3: Atualizar o seed `template-seed.ts`**

No tipo `Opts`, adicionar `| "dependeDe" | "campoDestino"` ao `Pick`... — na prática, trocar a definição para:
```ts
type Opts = Partial<Pick<TemplateItem, "descricao" | "tipo" | "condicaoFlags" | "condicaoModo" | "bloqueante" | "anexoObrigatorio" | "alertaRisco" | "dependeDe" | "campoDestino">>;
```
No factory `it`, no objeto retornado adicionar: `dependeDe: o.dependeDe ?? [], campoDestino: o.campoDestino ?? null,`.
Nos itens: 1.3 → acrescentar `{ ..., campoDestino: "competencia_inicial" }`; 6.1 → `{ dependeDe: ["4.6"] }`;
6.2 → `{ dependeDe: ["1.3", "2.5"] }`; 6.3 → `{ dependeDe: ["1.1"] }` (mesclar com os opts existentes, ex.
6.1 já tem `{ bloqueante: true }` → `{ bloqueante: true, dependeDe: ["4.6"] }`).

- [ ] **Step 4: Estender os testes** — em `src/tests/onboarding/processo.test.ts`:

No `TemplateBloco` de teste do `materializarProcesso`, adicionar `dependeDe: []` e `campoDestino: null` aos
dois itens (senão o TS reclama). E adicionar o bloco:
```ts
import { sugerirPerfil, somarDias, itemAplica, materializarProcesso, progressoProcesso, motivosBloqueioConclusao, type TemplateBloco } from "@/lib/onboarding/processo";

describe("motivosBloqueioConclusao", () => {
  const irmaos = [{ codigo: "4.6", status: "concluido" as const }, { codigo: "2.5", status: "pendente" as const }];
  const base = { dependeDe: [] as string[], anexoObrigatorio: false, temAnexo: false, campoDestino: null as string | null, temValorDestino: false };
  it("dependência atendida (concluído) → sem motivo", () => {
    expect(motivosBloqueioConclusao({ ...base, dependeDe: ["4.6"] }, irmaos)).toEqual([]);
  });
  it("dependência pendente → motivo", () => {
    expect(motivosBloqueioConclusao({ ...base, dependeDe: ["2.5"] }, irmaos)).toEqual(["Depende de 2.5"]);
  });
  it("anexo obrigatório sem anexo", () => {
    expect(motivosBloqueioConclusao({ ...base, anexoObrigatorio: true }, irmaos)).toEqual(["Anexo obrigatório pendente"]);
  });
  it("campo_destino sem valor", () => {
    expect(motivosBloqueioConclusao({ ...base, campoDestino: "competencia_inicial" }, irmaos)).toEqual(["Informe o valor (competência inicial)"]);
  });
  it("tudo ok → vazio", () => {
    expect(motivosBloqueioConclusao({ dependeDe: ["4.6"], anexoObrigatorio: true, temAnexo: true, campoDestino: "competencia_inicial", temValorDestino: true }, irmaos)).toEqual([]);
  });
});
```

- [ ] **Step 5: Rodar + verificar**

Run: `npm test -- onboarding/processo` (PASS), depois `npm run lint` e `npm run typecheck` (sem erros).

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/processo.ts src/lib/onboarding/template-seed.ts src/tests/onboarding/processo.test.ts
git commit -m "feat(onboarding): tipos depende_de/campo_destino + motivosBloqueioConclusao

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions do processo — enforce, write-back e anexo

**Files:**
- Modify: `src/app/(app)/clientes/[id]/processo.ts`

**Interfaces:**
- Consumes: `motivosBloqueioConclusao`, tipos ampliados (Task 2); `createAdminSupabase`.
- Produces: `ItemProcessoView` ampliado; `salvarProcessoItem` com `valorDestino`/`dependeDe`/`campoDestino`/`anexoObrigatorio`; `anexarProcessoItem`, `urlAnexoProcessoItem`, `removerAnexoProcessoItem`.

- [ ] **Step 1: Ampliar imports e `ItemProcessoView`**

No topo, trocar o import de helpers para incluir `motivosBloqueioConclusao` e adicionar o admin client:
```ts
import { materializarProcesso, progressoProcesso, motivosBloqueioConclusao, type PerfilCliente, type FlagsProcesso, type StatusItem, type TemplateBloco, type TemplateItem } from "@/lib/onboarding/processo";
import { createAdminSupabase } from "@/lib/supabase/admin";
```
Em `ItemProcessoView`, adicionar: `dependeDe: string[]; campoDestino: string | null; valorDestino: string | null; anexoNome: string | null; temAnexo: boolean;`.

- [ ] **Step 2: `listarProcessoCliente` — selecionar e mapear os campos novos**

No `.select(...)` de `onboarding_processo_item`, acrescentar `, depende_de, campo_destino, valor_destino, anexo_path, anexo_nome`.
No `.map((r) => ({...}))`, acrescentar: `dependeDe: (r.depende_de as string[]) ?? [], campoDestino: (r.campo_destino as string | null) ?? null, valorDestino: (r.valor_destino as string | null) ?? null, anexoNome: (r.anexo_nome as string | null) ?? null, temAnexo: !!r.anexo_path,`.

- [ ] **Step 3: `iniciarProcesso` — copiar depende_de/campo_destino**

Na reconstrução de `TemplateItem` (dentro de `blocos`), adicionar ao objeto: `dependeDe: (i.depende_de as string[]) ?? [], campoDestino: i.campo_destino as string | null,` e no `.select(...)` de `onboarding_template_item` acrescentar `, depende_de, campo_destino`.
No `linhas = seeds.map(...)`, acrescentar `depende_de: s.dependeDe, campo_destino: s.campoDestino,`.

- [ ] **Step 4: `salvarProcessoItem` — input ampliado + enforce + write-back**

Substituir a assinatura/corpo por:
```ts
export async function salvarProcessoItem(input: { id?: string; processoId: string; clienteId: string; blocoOrdem: number; blocoNome: string; codigo: string | null; titulo: string; tipo: "padrao" | "acesso"; responsavelPapel: string | null; responsavelId: string | null; prazo: string | null; status: StatusItem; observacao: string | null; bloqueante: boolean; dependeDe: string[]; anexoObrigatorio: boolean; campoDestino: string | null; valorDestino: string | null; acessoUrl: string | null; acessoLogin: string | null; novaSenha?: string | null; ordem: number }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  if (input.status === "concluido") {
    const { data: irmaosRows } = await supabase.from("onboarding_processo_item").select("id, codigo, status").eq("processo_id", input.processoId);
    const irmaos = (irmaosRows ?? []).filter((r) => r.id !== input.id).map((r) => ({ codigo: r.codigo as string | null, status: r.status as StatusItem }));
    let temAnexo = false;
    if (input.id) {
      const { data: atual } = await supabase.from("onboarding_processo_item").select("anexo_path").eq("id", input.id).maybeSingle();
      temAnexo = !!atual?.anexo_path;
    }
    const motivos = motivosBloqueioConclusao({ dependeDe: input.dependeDe, anexoObrigatorio: input.anexoObrigatorio, temAnexo, campoDestino: input.campoDestino, temValorDestino: !!input.valorDestino }, irmaos);
    if (motivos.length > 0) return { erro: motivos.join("; ") };
  }
  const row: Record<string, unknown> = { processo_id: input.processoId, bloco_ordem: input.blocoOrdem, bloco_nome: input.blocoNome, codigo: input.codigo, titulo: input.titulo, tipo: input.tipo, responsavel_papel: input.responsavelPapel, responsavel_id: input.responsavelId, prazo: input.prazo || null, status: input.status, observacao: input.observacao, bloqueante: input.bloqueante, depende_de: input.dependeDe, campo_destino: input.campoDestino, valor_destino: input.valorDestino, acesso_url: input.acessoUrl, acesso_login: input.acessoLogin, ordem: input.ordem, atualizado_em: new Date().toISOString(), atualizado_por: p.id };
  if (input.novaSenha) {
    try { row.acesso_senha_cifrada = cifrarSenha(input.novaSenha); } catch { return { erro: "Cofre não configurado (ONBOARDING_CRIPTO_KEY)." }; }
  }
  const { error } = input.id ? await supabase.from("onboarding_processo_item").update(row).eq("id", input.id) : await supabase.from("onboarding_processo_item").insert(row);
  if (error) return { erro: "Falha ao salvar." };
  if (input.status === "concluido" && input.campoDestino === "competencia_inicial" && input.valorDestino) {
    await supabase.from("clientes").update({ competencia_inicial: `${input.valorDestino}-01` }).eq("id", input.clienteId);
  }
  revalidatePath(`/clientes/${input.clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 5: Adicionar as actions de anexo ao final do arquivo**

```ts
const TIPOS_ANEXO = ["application/pdf", "image/png", "image/jpeg"];
const MAX_ANEXO = 10 * 1024 * 1024;
function nomeSeguroAnexo(nome: string): string {
  return nome.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "arquivo";
}

export async function anexarProcessoItem(itemId: string, clienteId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_processo_item").select("id, processo_id").eq("id", itemId).maybeSingle();
  if (!item) return { erro: "Item não encontrado ou sem permissão." };
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_ANEXO) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_ANEXO.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };
  const caminho = `onboarding/${item.processo_id}/${itemId}/${crypto.randomUUID()}-${nomeSeguroAnexo(file.name)}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) return { erro: "Falha no upload." };
  const { error } = await admin.from("onboarding_processo_item").update({ anexo_path: caminho, anexo_nome: file.name }).eq("id", itemId);
  if (error) {
    await admin.storage.from("documentos").remove([caminho]);
    return { erro: "Falha ao registrar o anexo." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function urlAnexoProcessoItem(itemId: string): Promise<{ url?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_processo_item").select("anexo_path").eq("id", itemId).maybeSingle();
  if (!item?.anexo_path) return { erro: "Sem anexo." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage.from("documentos").createSignedUrl(item.anexo_path as string, 60);
  if (error || !signed?.signedUrl) return { erro: "Não foi possível gerar o link." };
  return { url: signed.signedUrl };
}

export async function removerAnexoProcessoItem(itemId: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_processo_item").select("anexo_path").eq("id", itemId).maybeSingle();
  if (!item) return { erro: "Item não encontrado." };
  const admin = createAdminSupabase();
  if (item.anexo_path) await admin.storage.from("documentos").remove([item.anexo_path as string]);
  const { error } = await admin.from("onboarding_processo_item").update({ anexo_path: null, anexo_nome: null }).eq("id", itemId);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 6: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/clientes/[id]/processo.ts"
git commit -m "feat(onboarding): enforce de conclusão + write-back competência + anexo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Template actions — depende_de / campo_destino

**Files:**
- Modify: `src/app/(app)/onboarding/template-actions.ts`

**Interfaces:**
- Produces: `ItemTemplateView` com `dependeDe`/`campoDestino`; `salvarTemplateItem`/`semearTemplatePadrao` gravando-os.

- [ ] **Step 1: Ampliar `ItemTemplateView`** — adicionar `dependeDe: string[]; campoDestino: string | null;`.

- [ ] **Step 2: `listarTemplate`** — no `.select(...)` de `onboarding_template_item` acrescentar `, depende_de, campo_destino`; no map do `porBloco`, acrescentar `dependeDe: (i.depende_de as string[]) ?? [], campoDestino: i.campo_destino as string | null,`.

- [ ] **Step 3: `semearTemplatePadrao`** — no `linhas = b.itens.map(...)`, acrescentar `depende_de: i.dependeDe, campo_destino: i.campoDestino,`.

- [ ] **Step 4: `salvarTemplateItem`** — adicionar à assinatura `dependeDe: string[]; campoDestino: string | null;` e ao `row` `depende_de: input.dependeDe, campo_destino: input.campoDestino,`.

- [ ] **Step 5: Verificar + commit**

Run: `npm run lint && npm run typecheck && npm run build` (sem erros).
```bash
git add "src/app/(app)/onboarding/template-actions.ts"
git commit -m "feat(onboarding): template grava depende_de/campo_destino

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI — dependências, competência e anexo no ProcessoSection

**Files:**
- Modify: `src/components/onboarding/ProcessoSection.tsx`
- Test: `src/tests/onboarding/processo-section-render.test.tsx`

**Interfaces:**
- Consumes: `motivosBloqueioConclusao` (Task 2); `anexarProcessoItem`, `urlAnexoProcessoItem`, `removerAnexoProcessoItem`, `salvarProcessoItem` ampliado (Task 3).

- [ ] **Step 1: Atualizar o smoke** — em `processo-section-render.test.tsx`, adicionar ao mock do módulo `processo` as funções novas (`anexarProcessoItem: vi.fn(), urlAnexoProcessoItem: vi.fn(), removerProcessoItem: vi.fn(), removerAnexoProcessoItem: vi.fn()`) e, nos dois itens do array `itens`, acrescentar os campos: `dependeDe: [], campoDestino: null, valorDestino: null, anexoNome: null` (o `temAnexo` já mockar: item 1 `temAnexo: false`, e para exercitar dependência bloqueada trocar o item 2 para `{ ..., dependeDe: ["1.1"], anexoObrigatorio: true, temAnexo: false }`). Adicionar uma asserção: `expect(html).toContain("Contrato assinado")` (já existe) — e o teste continua passando.

- [ ] **Step 2: Imports + cálculo de motivos** — em `ProcessoSection.tsx`:

Adicionar aos imports:
```ts
import { iniciarProcesso, salvarProcessoItem, removerProcessoItem, revelarSenha, anexarProcessoItem, urlAnexoProcessoItem, removerAnexoProcessoItem, type ItemProcessoView, type ProcessoView } from "@/app/(app)/clientes/[id]/processo";
import { motivosBloqueioConclusao, type PerfilCliente, type StatusItem } from "@/lib/onboarding/processo";
```
Dentro do componente (após `const nomeUsuario = ...`), adicionar:
```ts
  const statusIrmaos = itens.map((i) => ({ codigo: i.codigo, status: i.status }));
  function bloqueios(it: ItemProcessoView): string[] {
    return motivosBloqueioConclusao({ dependeDe: it.dependeDe, anexoObrigatorio: it.anexoObrigatorio, temAnexo: it.temAnexo, campoDestino: it.campoDestino, temValorDestino: !!it.valorDestino }, statusIrmaos);
  }
  async function anexar(it: ItemProcessoView, file: File) {
    const fd = new FormData();
    fd.append("arquivo", file);
    await chamar(() => anexarProcessoItem(it.id, clienteId, fd));
  }
  async function baixar(it: ItemProcessoView) {
    const r = await urlAnexoProcessoItem(it.id);
    if (r.erro) return alert(r.erro);
    if (r.url) window.open(r.url, "_blank");
  }
```

- [ ] **Step 3: `mudarStatus` e `salvarForm` — passar os campos novos**

Em `mudarStatus`, trocar a chamada de `salvarProcessoItem` para incluir os campos novos:
```ts
    await chamar(() => salvarProcessoItem({ id: it.id, processoId: processo.id, clienteId, blocoOrdem: it.blocoOrdem, blocoNome: it.blocoNome, codigo: it.codigo, titulo: it.titulo, tipo: it.tipo, responsavelPapel: it.responsavelPapel, responsavelId: it.responsavelId, prazo: it.prazo, status, observacao: it.observacao, bloqueante: it.bloqueante, dependeDe: it.dependeDe, anexoObrigatorio: it.anexoObrigatorio, campoDestino: it.campoDestino, valorDestino: it.valorDestino, acessoUrl: it.acessoUrl, acessoLogin: it.acessoLogin, ordem: it.ordem }));
```
Em `salvarForm`, incluir também `dependeDe: form.dependeDe ?? [], anexoObrigatorio: form.anexoObrigatorio ?? false, campoDestino: form.campoDestino ?? null, valorDestino: form.valorDestino ?? null,` no objeto passado.

- [ ] **Step 4: Renderização do item — status com bloqueio, competência e anexo**

Substituir o `<select value={it.status} ...>` (o seletor de status na linha do item) por uma versão que desabilita "Concluído" quando houver bloqueio e mostra o motivo:
```tsx
                    {(() => {
                      const mtv = bloqueios(it);
                      return (
                        <>
                          <select value={it.status} disabled={ocupado} onChange={(e) => mudarStatus(it, e.target.value as StatusItem)} className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[it.status]}`}>
                            {(["pendente", "concluido", "dispensado"] as StatusItem[]).map((s) => (
                              <option key={s} value={s} disabled={s === "concluido" && mtv.length > 0}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </>
                      );
                    })()}
```
Logo após a linha de metadados (`<div className="mt-1 flex flex-wrap gap-x-4 ...">...</div>`), adicionar os blocos:
```tsx
                  {bloqueios(it).length > 0 && <p className="mt-1 text-[11px] text-negativo">Para concluir: {bloqueios(it).join(" · ")}</p>}
                  {it.campoDestino === "competencia_inicial" && (
                    <div className="mt-1 text-xs text-cinza">
                      Competência inicial:{" "}
                      <input type="month" value={it.valorDestino ?? ""} disabled={ocupado}
                        onChange={(e) => chamar(() => salvarProcessoItem({ id: it.id, processoId: processo.id, clienteId, blocoOrdem: it.blocoOrdem, blocoNome: it.blocoNome, codigo: it.codigo, titulo: it.titulo, tipo: it.tipo, responsavelPapel: it.responsavelPapel, responsavelId: it.responsavelId, prazo: it.prazo, status: it.status, observacao: it.observacao, bloqueante: it.bloqueante, dependeDe: it.dependeDe, anexoObrigatorio: it.anexoObrigatorio, campoDestino: it.campoDestino, valorDestino: e.target.value || null, acessoUrl: it.acessoUrl, acessoLogin: it.acessoLogin, ordem: it.ordem }))}
                        className="rounded border border-linha px-1.5 py-0.5 text-xs" />
                    </div>
                  )}
                  {(it.anexoObrigatorio || it.temAnexo) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cinza">
                      {it.temAnexo ? (
                        <>
                          <span>📎 {it.anexoNome}</span>
                          <button type="button" onClick={() => baixar(it)} className="text-verde underline">baixar</button>
                          <button type="button" onClick={() => chamar(() => removerAnexoProcessoItem(it.id, clienteId))} className="text-negativo underline">remover</button>
                        </>
                      ) : (
                        <label className="cursor-pointer text-verde underline">
                          anexar arquivo
                          <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" disabled={ocupado} onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexar(it, f); }} />
                        </label>
                      )}
                    </div>
                  )}
```
No modal de edição (form), adicionar (após o checkbox "Bloqueante") um campo de competência quando `form.campoDestino === "competencia_inicial"`:
```tsx
            {form.campoDestino === "competencia_inicial" && (
              <label className="block text-xs text-cinza">Competência inicial
                <input type="month" value={form.valorDestino ?? ""} onChange={(e) => setForm({ ...form, valorDestino: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            )}
```

- [ ] **Step 5: Rodar + suite**

Run: `npm test -- processo-section-render` (PASS), depois `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/ProcessoSection.tsx src/tests/onboarding/processo-section-render.test.tsx
git commit -m "feat(onboarding): UI de dependências, competência inicial e anexo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UI — editor do template + competência na ficha

**Files:**
- Modify: `src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx`
- Modify: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `salvarTemplateItem` ampliado (Task 4); `ItemTemplateView` com `dependeDe`/`campoDestino`.

- [ ] **Step 1: `EditorTemplate` — editar depende_de e campo_destino**

Na função `salvar`, incluir no objeto passado a `salvarTemplateItem`: `dependeDe: form.dependeDe ?? [], campoDestino: form.campoDestino ?? null,`.
No modal do form (após a `fieldset` de perfis), adicionar:
```tsx
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">Depende de (códigos, vírgula)
                <input value={(form.dependeDe ?? []).join(", ")} onChange={(e) => setForm({ ...form, dependeDe: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" placeholder="ex.: 4.6" />
              </label>
              <label className="flex-1 text-xs text-cinza">Grava em
                <select value={form.campoDestino ?? ""} onChange={(e) => setForm({ ...form, campoDestino: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="competencia_inicial">Competência inicial</option>
                </select>
              </label>
            </div>
```

- [ ] **Step 2: Ficha do cliente — exibir competência inicial**

Em `src/app/(app)/clientes/[id]/page.tsx`, no `.select(...)` de `clientes` acrescentar `, competencia_inicial`.
Logo após o `<h1>` (o nome do cliente), adicionar:
```tsx
      {(cliente as { competencia_inicial: string | null }).competencia_inicial && (
        <p className="-mt-4 text-sm text-cinza">
          Competência inicial: {(cliente as { competencia_inicial: string }).competencia_inicial.slice(5, 7)}/{(cliente as { competencia_inicial: string }).competencia_inicial.slice(0, 4)}
        </p>
      )}
```

- [ ] **Step 3: Suite completa**

Run: `npm run lint && npm run typecheck && npm test && npm run build` (tudo verde).

- [ ] **Step 4: Verificação visual (opcional)**

`npm run dev`: editor do template (definir depende_de/campo_destino); num cliente com processo, tentar concluir 6.1 antes de 4.6 (bloqueia), anexar um PDF num item de anexo, concluir o item 1.3 informando a competência → conferir "Competência inicial" na ficha.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracoes/onboarding/EditorTemplate.tsx" "src/app/(app)/clientes/[id]/page.tsx"
git commit -m "feat(onboarding): editor edita depende_de/campo_destino + competência na ficha

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CHANGELOG + finalizar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG** — sob `## [Não lançado]` → `### Adicionado`:
```markdown
- **Onboarding — dependências, competência e anexos (Ciclo B):** itens do processo agora respeitam
  **dependências** (não conclui enquanto os pré-requisitos não estiverem concluídos/dispensados),
  exigem **anexo** quando obrigatório (upload de PDF/imagem no processo) e gravam a **competência inicial**
  no cadastro do cliente ao concluir o item da data de corte. O editor de template permite definir os
  códigos de dependência e o campo de destino por item.
```

- [ ] **Step 2: Commit + finalizar**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do onboarding Ciclo B

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Depois usar `superpowers:finishing-a-development-branch`. (Deploy sem novos segredos; `ONBOARDING_CRIPTO_KEY` já existe.)

---

## Self-Review

- **Cobertura do spec:** migration+backfill+competencia_inicial (T1) ✓; tipos/seed/materializar + `motivosBloqueioConclusao` (T2) ✓; enforce+write-back+anexo nas actions (T3) ✓; template grava depende_de/campo_destino (T4) ✓; UI dependências/competência/anexo (T5) ✓; editor + ficha (T6) ✓; CHANGELOG (T7) ✓. Testes unit (T2) + smoke (T5) ✓.
- **Placeholders:** nenhum — todo passo tem código/comando concreto (T1 referencia o bloco SQL completo do spec).
- **Consistência de tipos:** `dependeDe`/`campoDestino` adicionados a `TemplateItem`/`ProcessoItemSeed` (T2), lidos/gravados nas actions (T3/T4) e consumidos na UI (T5/T6); `motivosBloqueioConclusao` mesma assinatura em T2/T3/T5; `ItemProcessoView` ampliado (T3) usado no smoke e na UI. `salvarProcessoItem` recebe os campos novos em todas as chamadas (mudarStatus, salvarForm, competência inline). `createAdminSupabase`/Storage seguem o padrão de `documentos`.
- **Segurança:** anexo lê o item pela sessão (RLS de isolamento por cliente) antes de operar Storage; download por signed URL de 60s; gate `podeCriarCliente`. Enforce de conclusão no servidor (a UI só previne).
- **Escopo:** só Ciclo B. Alertas/consultoria/comercial (C) e construtor de templates (v2) fora.
