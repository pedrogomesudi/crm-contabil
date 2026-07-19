# RF-040 (anexos em tarefas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anexar arquivos a uma tarefa (avulsa ou recorrente) na página de detalhe, fechando o último gap do RF-040.

**Architecture:** tabela `tarefa_anexo` (separada do GED), arquivos no bucket "documentos" com prefixo `tarefas/`, actions no molde de `documentos/actions.ts` (permissão na app + `createAdminSupabase`), e uma seção `AnexosTarefa` na página `tarefas/[id]`.

**Tech Stack:** Next 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS/Storage), vitest.

## Global Constraints

- Next 16: `middleware.ts` é `proxy.ts`; imports via `@/*`; imagens só `next/image`.
- RBAC: papel só de `usuarios.papel` via `auth_papel()`; nunca do JWT.
- Migrations: runner `npm run db:migrate` (NÃO `supabase db push`); imutáveis após aplicadas; idempotentes; numerar após a última (`0109`).
- Guard `divida-ui`: controles sem `border` à mão → `controleCls`/`Campo` (`@/components/ui/Campo`).
- Storage: usa `createAdminSupabase` (service_role); a permissão é checada na action (o upload bypassa RLS). Limites: PDF/PNG/JPG, ≤ 10 MB (iguais ao GED).
- Rodar antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`, `npm run build`.
- Entrega por PR `develop`→`main` (verify verde); tag só após deploy confirmado no `/api/health`; versão + CHANGELOG no mesmo PR (`versao.test.ts`).
- Sem rota nova (seção em página existente) → `rotas-alcancaveis` não muda.

---

### Task 1: Migration 0110 — `tarefa_anexo` + RLS

**Files:**
- Create: `supabase/migrations/0110_tarefa_anexo.sql`

**Interfaces:**
- Produces: `tarefa_anexo(id, tarefa_id, nome, caminho_storage unique, enviado_por, enviado_em)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RF-040: anexos de tarefa (tabela própria, separada do GED do cliente).
create table if not exists tarefa_anexo (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  nome text not null,
  caminho_storage text not null unique,
  enviado_por uuid references usuarios(id),
  enviado_em timestamptz not null default now()
);
create index if not exists idx_tarefa_anexo_tarefa on tarefa_anexo(tarefa_id);
alter table tarefa_anexo enable row level security;

drop policy if exists tarefa_anexo_sel on tarefa_anexo;
create policy tarefa_anexo_sel on tarefa_anexo for select to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id));
drop policy if exists tarefa_anexo_ins on tarefa_anexo;
create policy tarefa_anexo_ins on tarefa_anexo for insert to authenticated
  with check (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
drop policy if exists tarefa_anexo_del on tarefa_anexo;
create policy tarefa_anexo_del on tarefa_anexo for delete to authenticated
  using (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
```

- [ ] **Step 2: Conferir idempotência** (`create table/index if not exists`, `drop policy if exists` antes de `create policy`). Nenhuma migration aplicada editada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0110_tarefa_anexo.sql
git commit -m "feat(rf040): migration 0110 tarefa_anexo"
```

> Aplicada em produção no release, antes de Implantar.

---

### Task 2: Lógica pura — `caminhoAnexoTarefa`

**Files:**
- Create: `src/lib/tarefas/anexo.ts`
- Test: `src/tests/tarefas/anexo.test.ts`

**Interfaces:**
- Produces:
  - `nomeSeguro(nome: string): string`
  - `caminhoAnexoTarefa(tarefaId: string, nomeArquivo: string, id: string): string`

- [ ] **Step 1: Escrever os testes (falham)**

```ts
import { describe, it, expect } from "vitest";
import { caminhoAnexoTarefa, nomeSeguro } from "@/lib/tarefas/anexo";

describe("nomeSeguro", () => {
  it("troca espaços e tira acentos, preserva a extensão", () => {
    expect(nomeSeguro("Relatório Anual 2026.pdf")).toBe("Relatorio_Anual_2026.pdf");
  });
  it("neutraliza path traversal", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("etc_passwd");
  });
  it("vazio vira 'arquivo'", () => {
    expect(nomeSeguro("///")).toBe("arquivo");
  });
});

describe("caminhoAnexoTarefa", () => {
  it("monta o caminho com prefixo e nome saneado", () => {
    expect(caminhoAnexoTarefa("t1", "Nota Fiscal.png", "abc")).toBe("tarefas/t1/abc-Nota_Fiscal.png");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/tarefas/anexo.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// Sanea o nome para uso como object name no Storage: tira acentos (NFD), troca o que não for
// letra/número/._- por "_", remove barras e pontos iniciais (anti path traversal), limita o tamanho.
export function nomeSeguro(nome: string): string {
  const semAcento = nome.normalize("NFD").replace(/[̀-ͯ]/g, ""); // tira diacríticos
  const limpo = semAcento
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
}

export function caminhoAnexoTarefa(tarefaId: string, nomeArquivo: string, id: string): string {
  return `tarefas/${tarefaId}/${id}-${nomeSeguro(nomeArquivo)}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/tarefas/anexo.test.ts`
Expected: PASS.

> Nota: a asserção `nomeSeguro("Relatório Anual 2026.pdf") === "Relatorio_Anual_2026.pdf"` exige colapsar `_` repetidos (o `.replace(/_+/g, "_")`). E `"../../etc/passwd"` → depois do replace vira `.._.._etc_passwd`; o `^[._]+` remove o prefixo `.._.._` → `etc_passwd`. Conferir que os testes passam exatamente com esses valores; ajustar o regex se necessário (o teste é a fonte da verdade).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tarefas/anexo.ts src/tests/tarefas/anexo.test.ts
git commit -m "feat(rf040): caminhoAnexoTarefa (saneamento do nome)"
```

---

### Task 3: Actions de anexo

**Files:**
- Create: `src/app/(app)/tarefas/[id]/anexo-actions.ts`

**Interfaces:**
- Consumes: `caminhoAnexoTarefa` (T2), `EstadoUpload`/`ResultadoDownload`/`ResultadoExcluir` (`@/app/(app)/documentos/estados`), `getPerfilAtual`, `createServerSupabase`, `createAdminSupabase`.
- Produces:
  - `anexarTarefaArquivo(tarefaId: string, _prev: EstadoUpload, formData: FormData): Promise<EstadoUpload>`
  - `listarAnexosTarefa(tarefaId: string): Promise<{ id: string; nome: string; enviado_em: string }[]>`
  - `linkDownloadAnexo(anexoId: string): Promise<ResultadoDownload>`
  - `excluirAnexo(anexoId: string, tarefaId: string): Promise<ResultadoExcluir>`

- [ ] **Step 1: Implementar**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { caminhoAnexoTarefa } from "@/lib/tarefas/anexo";
import type { EstadoUpload, ResultadoDownload, ResultadoExcluir } from "@/app/(app)/documentos/estados";

const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

// Espelha a RLS de tarefa: admin/assistente OU responsável/criador da tarefa.
async function podeEditarTarefa(
  perfilId: string,
  papel: string,
  tarefaId: string,
): Promise<boolean> {
  if (papel === "admin" || papel === "assistente") {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from("tarefa").select("id").eq("id", tarefaId).maybeSingle();
    return !!data;
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tarefa")
    .select("responsavel_id, criado_por")
    .eq("id", tarefaId)
    .maybeSingle();
  if (!data) return false;
  return data.responsavel_id === perfilId || data.criado_por === perfilId;
}

export async function anexarTarefaArquivo(
  tarefaId: string,
  _prev: EstadoUpload,
  formData: FormData,
): Promise<EstadoUpload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!(await podeEditarTarefa(perfil.id, perfil.papel, tarefaId))) {
    return { erro: "Você não pode anexar arquivos a esta tarefa." };
  }

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const caminho = caminhoAnexoTarefa(tarefaId, file.name, crypto.randomUUID());
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarTarefaArquivo (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }
  const { error: errInsert } = await admin.from("tarefa_anexo").insert({
    tarefa_id: tarefaId,
    nome: file.name,
    caminho_storage: caminho,
    enviado_por: perfil.id,
  });
  if (errInsert) {
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarTarefaArquivo (insert):", errInsert.message);
    return { erro: "Falha ao registrar o anexo." };
  }
  revalidatePath(`/tarefas/${tarefaId}`);
  return { ok: true };
}

export async function listarAnexosTarefa(
  tarefaId: string,
): Promise<{ id: string; nome: string; enviado_em: string }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tarefa_anexo")
    .select("id, nome, enviado_em")
    .eq("tarefa_id", tarefaId)
    .order("enviado_em", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id as string,
    nome: a.nome as string,
    enviado_em: a.enviado_em as string,
  }));
}

export async function linkDownloadAnexo(anexoId: string): Promise<ResultadoDownload> {
  const supabase = await createServerSupabase();
  // A RLS de tarefa_anexo já garante que o usuário enxerga o anexo (via tarefa).
  const { data: anexo } = await supabase
    .from("tarefa_anexo")
    .select("caminho_storage")
    .eq("id", anexoId)
    .maybeSingle();
  if (!anexo) return { erro: "Anexo não encontrado ou sem permissão." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage
    .from("documentos")
    .createSignedUrl(anexo.caminho_storage as string, 60);
  if (error || !signed) return { erro: "Falha ao gerar o link." };
  return { url: signed.signedUrl };
}

export async function excluirAnexo(anexoId: string, tarefaId: string): Promise<ResultadoExcluir> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!(await podeEditarTarefa(perfil.id, perfil.papel, tarefaId))) {
    return { erro: "Você não pode remover anexos desta tarefa." };
  }
  const admin = createAdminSupabase();
  const { data: anexo } = await admin
    .from("tarefa_anexo")
    .select("caminho_storage")
    .eq("id", anexoId)
    .maybeSingle();
  if (!anexo) return { erro: "Anexo não encontrado." };
  const { error } = await admin.from("tarefa_anexo").delete().eq("id", anexoId);
  if (error) return { erro: "Falha ao remover o anexo." };
  const { error: errRm } = await admin.storage.from("documentos").remove([anexo.caminho_storage as string]);
  if (errRm) console.error("excluirAnexo (storage órfão):", errRm.message);
  revalidatePath(`/tarefas/${tarefaId}`);
  return { ok: true };
}
```

> **Nota:** confirmar que `getPerfilAtual()` devolve `{ id, papel, ativo }` (é o mesmo perfil usado em `anexarDocumento` e na página da tarefa). Se `perfil.papel` for tipado como enum `Papel`, ajustar a assinatura de `podeEditarTarefa` para `Papel`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/tarefas/[id]/anexo-actions.ts"
git commit -m "feat(rf040): actions de anexo de tarefa (anexar/listar/baixar/excluir)"
```

---

### Task 4: Seção `AnexosTarefa` + wiring na página

**Files:**
- Create: `src/components/tarefas/AnexosTarefa.tsx`
- Modify: `src/app/(app)/tarefas/[id]/page.tsx` (carregar anexos + renderizar a seção)
- Test: `src/tests/tarefas/anexos-tarefa.test.tsx`

**Interfaces:**
- Consumes: `anexarTarefaArquivo`/`linkDownloadAnexo`/`excluirAnexo` (T3), `EstadoUpload`.

- [ ] **Step 1: Render test (falha)**

```tsx
import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/tarefas/[id]/anexo-actions", () => ({
  anexarTarefaArquivo: vi.fn(),
  linkDownloadAnexo: vi.fn(),
  excluirAnexo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { AnexosTarefa } from "@/components/tarefas/AnexosTarefa";

describe("AnexosTarefa", () => {
  it("lista os anexos e mostra o upload quando pode editar", () => {
    const html = renderToStaticMarkup(
      <AnexosTarefa
        tarefaId="t1"
        podeEditar
        anexos={[{ id: "a1", nome: "contrato.pdf", enviado_em: "2026-07-19T00:00:00Z" }]}
      />,
    );
    expect(html).toContain("Anexos");
    expect(html).toContain("contrato.pdf");
    expect(html).toContain('type="file"');
  });

  it("sem permissão, não mostra o upload", () => {
    const html = renderToStaticMarkup(<AnexosTarefa tarefaId="t1" podeEditar={false} anexos={[]} />);
    expect(html).not.toContain('type="file"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/tests/tarefas/anexos-tarefa.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar `AnexosTarefa`**

```tsx
"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import type { EstadoUpload } from "@/app/(app)/documentos/estados";
import { anexarTarefaArquivo, linkDownloadAnexo, excluirAnexo } from "@/app/(app)/tarefas/[id]/anexo-actions";

type Anexo = { id: string; nome: string; enviado_em: string };

export function AnexosTarefa({
  tarefaId,
  podeEditar,
  anexos,
}: {
  tarefaId: string;
  podeEditar: boolean;
  anexos: Anexo[];
}) {
  const router = useRouter();
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(
    anexarTarefaArquivo.bind(null, tarefaId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [estado.ok, router]);

  async function baixar(id: string) {
    const r = await linkDownloadAnexo(id);
    if (r.url) window.open(r.url, "_blank", "noopener");
    else setErro(r.erro ?? "Falha ao baixar.");
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirAnexo(id, tarefaId);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Anexos</h3>
      <ul className="space-y-1 text-sm">
        {anexos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <button type="button" className="underline" onClick={() => baixar(a.id)}>
              {a.nome}
            </button>
            {podeEditar && (
              <button
                type="button"
                className="text-negativo underline"
                disabled={busy}
                onClick={() => remover(a.id)}
              >
                remover
              </button>
            )}
          </li>
        ))}
        {anexos.length === 0 && <li className="text-cinza">Nenhum anexo.</li>}
      </ul>

      {podeEditar && (
        <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            name="arquivo"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={controleCls("compacto")}
          />
          <Botao type="submit" variante="secundario" disabled={pending}>
            {pending ? "Enviando..." : "Anexar"}
          </Botao>
        </form>
      )}

      {(estado.erro || erro) && (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro ?? erro}
        </p>
      )}
    </section>
  );
}
```

> **Nota `divida-ui`:** o `input type=file` usa `controleCls("compacto")` — sem `border` à mão.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/tests/tarefas/anexos-tarefa.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wiring na página**

Em `src/app/(app)/tarefas/[id]/page.tsx`:

1. Imports:

```tsx
import { AnexosTarefa } from "@/components/tarefas/AnexosTarefa";
import { listarAnexosTarefa } from "./anexo-actions";
```

2. Carregar os anexos e computar `podeEditar` (admin/assistente ou responsável/criador). O `select` da tarefa
   ainda não traz `criado_por` — incluir na query e carregar os anexos:

```tsx
  // (no .select da tarefa, adicionar "criado_por")
  const anexos = await listarAnexosTarefa(id);
  const podeEditar =
    perfil.papel === "admin" ||
    perfil.papel === "assistente" ||
    (t.responsavel_id as string | null) === perfil.id ||
    (t.criado_por as string | null) === perfil.id;
```

3. Renderizar a seção após `HorasDaTarefa` (antes de fechar o `Container`):

```tsx
      <AnexosTarefa tarefaId={id} podeEditar={podeEditar} anexos={anexos} />
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npx vitest run src/tests/tarefas/ src/tests/ui/divida-ui.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/tarefas/AnexosTarefa.tsx "src/app/(app)/tarefas/[id]/page.tsx" src/tests/tarefas/anexos-tarefa.test.tsx
git commit -m "feat(rf040): secao de anexos na pagina da tarefa"
```

---

### Task 5: Release

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run format && npm run build` — tudo verde.
- [ ] **Step 2:** bump de versão (minor) + CHANGELOG (mesmo PR).
- [ ] **Step 3:** aplicar migration 0110 em produção (`node --env-file=.env.producao.bak scripts/db-migrate.mjs`) **antes** de Implantar.
- [ ] **Step 4:** REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (PR `develop`→`main`, `gh pr checks --watch`, merge). Implantar, confirmar `/api/health`, tag depois.

---

## Self-Review

- **Cobertura da spec:** `tarefa_anexo` + RLS espelhando `tarefa` (T1), bucket "documentos" com prefixo via `caminhoAnexoTarefa` (T2), actions anexar/listar/baixar/excluir com permissão de dono (T3), seção `AnexosTarefa` na página com gate `podeEditar` (T4), release com migration em prod (T5). Fora de escopo respeitado (sem log LGPD, sem versionamento, sem espelho no GED).
- **Placeholders:** nenhum passo de código sem código; as duas Notas (regex saneamento é validado pelo teste; forma de `getPerfilAtual`) são verificações pontuais.
- **Consistência de tipos:** `EstadoUpload`/`ResultadoDownload`/`ResultadoExcluir` reusados do GED em T3/T4; `caminhoAnexoTarefa` (T2) chamado em T3; `listarAnexosTarefa` (T3) devolve `{id,nome,enviado_em}` consumido igual pelo `AnexosTarefa` (T4).
