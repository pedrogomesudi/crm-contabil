# RF-060 Fatia B — GED: versionamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** versionar documentos — "Nova versão" a partir de um documento existente; a lista mostra os atuais com um selo "N versões" que expande as anteriores; o portal mostra só os atuais. Fecha o RF-060.

**Architecture:** `documentos.substitui_id` (auto-ref). Lógica pura `agruparVersoes` monta (atual, anteriores[]). `anexarNovaVersao` herda a taxonomia do antigo e grava `substitui_id`. Escritório e portal reusam `agruparVersoes`.

**Tech Stack:** Next 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS/Storage), vitest.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports `@/*`.
- RBAC: papel só via `auth_papel()`.
- Migrations: runner `npm run db:migrate`; imutáveis após aplicadas; idempotentes; numerar após `0111`.
- Guard `divida-ui`: controles sem `border` à mão → `controleCls` (`@/components/ui/Campo`).
- Storage: `createAdminSupabase` (service_role); permissão checada na action; limites PDF/PNG/JPG ≤ 10 MB.
- Sem rota nova → `rotas-alcancaveis` não muda.
- Rodar antes de entregar: `lint`, `typecheck`, `test`, `format`, `build`. PR `develop`→`main`; tag após deploy; versão+CHANGELOG no mesmo PR.

---

### Task 1: Migration 0112 — `documentos.substitui_id`

**Files:**
- Create: `supabase/migrations/0112_documentos_versao.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-060 (Fatia B): versionamento de documentos.
alter table documentos add column if not exists substitui_id uuid references documentos(id) on delete set null;
create index if not exists idx_documentos_substitui on documentos(substitui_id);
```

- [ ] **Step 2: Conferir idempotência** (`add column if not exists`, `create index if not exists`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0112_documentos_versao.sql
git commit -m "feat(rf060b): migration 0112 documentos.substitui_id"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — `agruparVersoes`

**Files:**
- Create: `src/lib/documentos/versoes.ts`
- Test: `src/tests/documentos/versoes.test.ts`

**Interfaces:**
- Produces: `agruparVersoes<T extends { id: string; substitui_id: string | null }>(docs: T[]): { atual: T; anteriores: T[] }[]`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { agruparVersoes } from "@/lib/documentos/versoes";

const d = (id: string, substitui_id: string | null) => ({ id, substitui_id });

describe("agruparVersoes", () => {
  it("cadeia de 3 vira 1 atual + 2 anteriores (recente→antiga)", () => {
    const r = agruparVersoes([d("c", "b"), d("b", "a"), d("a", null)]);
    expect(r).toEqual([{ atual: d("c", "b"), anteriores: [d("b", "a"), d("a", null)] }]);
  });

  it("documentos sem versão viram grupos de 1", () => {
    const r = agruparVersoes([d("x", null), d("y", null)]);
    expect(r).toEqual([
      { atual: d("x", null), anteriores: [] },
      { atual: d("y", null), anteriores: [] },
    ]);
  });

  it("referência órfã não quebra (vira atual isolado)", () => {
    const r = agruparVersoes([d("c", "sumiu")]);
    expect(r).toEqual([{ atual: d("c", "sumiu"), anteriores: [] }]);
  });

  it("preserva a ordem de entrada dos atuais", () => {
    const r = agruparVersoes([d("y", null), d("c", "b"), d("b", null)]);
    expect(r.map((g) => g.atual.id)).toEqual(["y", "c"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/versoes.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// Agrupa a lista plana em (atual, anteriores[]). "atual" = id não referenciado por nenhum
// substitui_id; "anteriores" = a cadeia via substitui_id, do mais recente ao mais antigo.
// A ordem dos grupos preserva a ordem de entrada dos atuais. Um conjunto de visitados evita
// laço em caso de ciclo (que o fluxo de gravação não produz).
export function agruparVersoes<T extends { id: string; substitui_id: string | null }>(
  docs: T[],
): { atual: T; anteriores: T[] }[] {
  const porId = new Map(docs.map((doc) => [doc.id, doc]));
  const referidos = new Set<string>();
  for (const doc of docs) if (doc.substitui_id) referidos.add(doc.substitui_id);

  const grupos: { atual: T; anteriores: T[] }[] = [];
  for (const doc of docs) {
    if (referidos.has(doc.id)) continue; // alguém o substitui → não é atual
    const anteriores: T[] = [];
    const visitados = new Set<string>([doc.id]);
    let cur = doc.substitui_id ? porId.get(doc.substitui_id) : undefined;
    while (cur && !visitados.has(cur.id)) {
      anteriores.push(cur);
      visitados.add(cur.id);
      cur = cur.substitui_id ? porId.get(cur.substitui_id) : undefined;
    }
    grupos.push({ atual: doc, anteriores });
  }
  return grupos;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/versoes.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/versoes.ts src/tests/documentos/versoes.test.ts
git commit -m "feat(rf060b): agruparVersoes (atual + anteriores, anti-ciclo)"
```

---

### Task 3: Action `anexarNovaVersao`

**Files:**
- Modify: `src/app/(app)/documentos/actions.ts`

**Interfaces:**
- Produces: `anexarNovaVersao(documentoAntigoId: string, _prev: EstadoUpload, formData: FormData): Promise<EstadoUpload>`

- [ ] **Step 1: Implementar** (no fim de `documentos/actions.ts`, reusa `nomeSeguro`, `TIPOS_OK`, `MAX_BYTES`)

```ts
export async function anexarNovaVersao(
  documentoAntigoId: string,
  _prev: EstadoUpload,
  formData: FormData,
): Promise<EstadoUpload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeGerenciarDocumentos(perfil.papel)) {
    return { erro: "Você não tem permissão para anexar documentos." };
  }

  const supabase = await createServerSupabase();
  // A RLS prova que o usuário enxerga o documento antigo (logo, o cliente).
  const { data: antigo } = await supabase
    .from("documentos")
    .select("cliente_id, tipo, tipo_id, departamento, competencia")
    .eq("id", documentoAntigoId)
    .maybeSingle();
  if (!antigo) return { erro: "Documento não encontrado ou sem permissão." };

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const clienteId = antigo.cliente_id as string;
  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarNovaVersao (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }
  const { error: errInsert } = await admin.from("documentos").insert({
    cliente_id: clienteId,
    nome: file.name,
    tipo: antigo.tipo,
    tipo_id: antigo.tipo_id,
    departamento: antigo.departamento,
    competencia: antigo.competencia,
    caminho_storage: caminho,
    enviado_por: perfil.id,
    substitui_id: documentoAntigoId,
  });
  if (errInsert) {
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarNovaVersao (insert):", errInsert.message);
    return { erro: "Falha ao registrar a nova versão." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/documentos/actions.ts"
git commit -m "feat(rf060b): anexarNovaVersao (herda taxonomia + substitui_id)"
```

---

### Task 4: UI do escritório (N versões + Nova versão) e portal (só atuais)

**Files:**
- Modify: `src/components/documentos/DocumentosSection.tsx` (carrega `substitui_id`, agrupa, passa anteriores)
- Modify: `src/components/documentos/DocumentosTabela.tsx` (selo "N versões" expansível + "Nova versão")
- Modify: `src/app/(portal)/portal/documentos/page.tsx` (mostra só os atuais)
- Test: `src/tests/documentos/documentos-tabela.test.tsx` (cobrir "N versões")

**Interfaces:**
- Consumes: `agruparVersoes` (T2), `anexarNovaVersao` (T3).
- `DocItem` ganha `substitui_id: string | null`; a tabela recebe `docs: (DocItem & { anteriores: DocItem[] })[]`.

- [ ] **Step 1: `DocumentosSection` carrega `substitui_id`, monta `DocItem[]` e agrupa**

- No `.select` de `documentos`, adicionar `substitui_id`.
- No map que monta `DocItem`, adicionar `substitui_id: (d.substitui_id as string | null) ?? null`.
- Após montar `docs: DocItem[]`, agrupar e achatar para a tabela:

```tsx
import { agruparVersoes } from "@/lib/documentos/versoes";
// ...
const grupos = agruparVersoes(docs); // { atual, anteriores }[]
const linhas = grupos.map((g) => ({ ...g.atual, anteriores: g.anteriores }));
```
- Passar `docs={linhas}` para `<DocumentosTabela>` (em vez de `docs={docs}`). A condição de "há documentos" passa a `linhas.length > 0`.

- [ ] **Step 2: Estender o render test (falha)**

Em `src/tests/documentos/documentos-tabela.test.tsx`, incluir `substitui_id: null` e `anteriores: []` nos itens existentes e adicionar:

```tsx
  it("mostra o selo de versões quando há anteriores", () => {
    const anterior = { ...doc, id: "d0", nome: "guia-v1.pdf", anteriores: [] };
    const atual = { ...doc, id: "d1", nome: "guia-v2.pdf", substitui_id: "d0", anteriores: [anterior] };
    const html = renderToStaticMarkup(
      <DocumentosTabela docs={[atual]} clienteId="c1" clienteNome="X" clienteEmail="x@x" podeGerenciar ehAdmin={false} />,
    );
    expect(html).toContain("guia-v2.pdf");
    expect(html).toContain("versões");
    expect(html).toContain("guia-v1.pdf"); // anterior renderizado (details/summary)
  });
```
(atualizar o `doc` base do arquivo para incluir `substitui_id: null` e `anteriores: []`.)

- [ ] **Step 3: Rodar e ver falhar** — Run: `npx vitest run src/tests/documentos/documentos-tabela.test.tsx` — Expected: FAIL.

- [ ] **Step 4: `DocumentosTabela` — tipo, selo e "Nova versão"**

- Ampliar `DocItem` com `substitui_id: string | null` e a prop de docs para `(DocItem & { anteriores: DocItem[] })[]`.
- Na célula "Nome" da linha atual, quando `d.anteriores.length > 0`, renderizar um `<details>` com `<summary>` "{n} versões" que lista as anteriores (nome + `formatarData(enviado_em)` + `BotaoBaixar`). `<details>`/`<summary>` dá o expandir sem estado.
- Na célula "Ações", quando `podeGerenciar`, adicionar um `<NovaVersao documentoId={d.id} />` (sub-componente client no mesmo arquivo: `input type=file` + submit via `useActionState(anexarNovaVersao.bind(null, documentoId))`, `router.refresh()` no sucesso). Controles via `controleCls`.

Exemplo do bloco de versões (dentro da `<td>` do Nome, após o nome/selos):

```tsx
{d.anteriores.length > 0 && (
  <details className="mt-1">
    <summary className="cursor-pointer text-xs text-cinza">{d.anteriores.length} versões anteriores</summary>
    <ul className="mt-1 space-y-1">
      {d.anteriores.map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-xs text-cinza">
          <span>{a.nome}</span>
          <time dateTime={a.enviado_em}>{formatarData(a.enviado_em)}</time>
          <BotaoBaixar documentoId={a.id} nome={a.nome} />
        </li>
      ))}
    </ul>
  </details>
)}
```

Sub-componente `NovaVersao` (mesmo arquivo):

```tsx
function NovaVersao({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(
    anexarNovaVersao.bind(null, documentoId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) { formRef.current?.reset(); router.refresh(); }
  }, [estado.ok, router]);
  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input name="arquivo" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className={controleCls("compacto")} />
      <button type="submit" disabled={pending} className="text-xs text-verde underline disabled:opacity-60">
        {pending ? "Enviando..." : "Nova versão"}
      </button>
      {estado.erro && <span className="text-xs text-negativo">{estado.erro}</span>}
    </form>
  );
}
```
(imports novos no arquivo: `useActionState, useEffect, useRef` de react, `useRouter` de next/navigation, `EstadoUpload` de `@/app/(app)/documentos/estados`, `anexarNovaVersao` de `@/app/(app)/documentos/actions`.)

- [ ] **Step 5: Rodar e ver passar** — Run: `npx vitest run src/tests/documentos/documentos-tabela.test.tsx` — Expected: PASS.

- [ ] **Step 6: Portal — só os atuais**

Em `src/app/(portal)/portal/documentos/page.tsx`: ampliar o `.select` com `substitui_id`, e reduzir aos atuais via `agruparVersoes`:

```tsx
import { agruparVersoes } from "@/lib/documentos/versoes";
// ...
  const { data } = await supabase
    .from("documentos")
    .select("id, nome, tipo, enviado_em, origem, substitui_id")
    .order("enviado_em", { ascending: false });
  const docs = agruparVersoes(data ?? []).map((g) => g.atual);
```
(o resto da página consome `docs` como antes).

- [ ] **Step 7: Verificar** — Run: `npm run typecheck && npx vitest run src/tests/documentos/ src/tests/ui/divida-ui.test.ts` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/documentos/DocumentosSection.tsx src/components/documentos/DocumentosTabela.tsx "src/app/(portal)/portal/documentos/page.tsx" src/tests/documentos/documentos-tabela.test.tsx
git commit -m "feat(rf060b): N versoes na listagem + nova versao + portal so atuais"
```

---

### Task 5: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR) — fecha o RF-060.
- [ ] **Step 3:** aplicar migration 0112 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR, merge, Implantar, `/api/health`, tag).

---

## Self-Review

- **Cobertura da spec:** `substitui_id` (T1), `agruparVersoes` (T2), `anexarNovaVersao` herdando a taxonomia (T3), "N versões" expansível + "Nova versão" no escritório e portal só-atuais (T4), release com migration em prod (T5). Fora de escopo respeitado (sem diff, sem numeração v1/v2, sem reverter).
- **Placeholders:** nenhum passo de código sem código.
- **Consistência de tipos:** `agruparVersoes` (T2) usado em T4 (escritório e portal); `DocItem` ganha `substitui_id` e a tabela recebe `anteriores`; `anexarNovaVersao` (T3) consumido pelo `NovaVersao` (T4) com `EstadoUpload` do GED; a taxonomia herdada usa as colunas da Fatia A (`tipo/tipo_id/departamento/competencia`).
