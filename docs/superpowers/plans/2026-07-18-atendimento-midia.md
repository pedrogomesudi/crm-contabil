# Atendimento — mídia como no WhatsApp — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-atendimento-midia-design.md`.

**Objetivo:** os arquivos do Atendimento abrem rápido (URL assinada, direto do Storage) e aparecem como no
WhatsApp (miniatura+lightbox, player de áudio, cartão de documento).

**Arquitetura:** o `abrirConversa` assina as URLs das mídias da conversa numa chamada (`createSignedUrls`)
e as inclui na `MsgConversa` (novo campo `midiaUrl`). O componente `Midia` sai do `Inbox` para um arquivo
próprio, dividido em imagem/áudio/documento + lightbox. O ícone do documento vem de uma função pura testável.

**Stack:** Next.js 16, Supabase Storage (`createSignedUrls`, storage-js 2.108), TypeScript, vitest.

## Global Constraints

- **Nenhuma mudança no webhook, no Storage, na RLS, no envio de mídia.** Esta fatia é só visualização.
- **A rota-proxy `/api/atendimento/midia/[id]` fica** como fallback de download — não é removida.
- **A assinatura usa o `admin`** (não o client com RLS): a policy de storage só libera paths na tabela
  `documentos`, e a mídia do atendimento não tem linha lá. A autorização já foi feita na leitura das
  mensagens (`gate()` + `wa_msg_select`), então assinar com admin depois não abre brecha.
- **A lista de conversas NÃO precisa de URL** — só mostra prévia de texto. Só o `abrirConversa` assina.
- **Tamanho do arquivo omitido** (não está no schema).
- **`main` protegido:** PR de `develop` com o `verify` verde. **O merge não publica** (Implantar + health).
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`. **Esta fatia não tem migration** — nada a aplicar no banco.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/whatsapp/midia.ts` | **Criar** — `iconeDeMime` (lógica pura) | 1 |
| `src/tests/whatsapp/midia.test.ts` | **Criar** — testa `iconeDeMime` | 1 |
| `src/lib/whatsapp/inbox.ts` | **Modificar** — `MsgConversa` + `midiaUrl` | 2 |
| `src/lib/whatsapp/realtime.ts` | **Modificar** — `linhaParaMsg` devolve `midiaUrl: null` | 2 |
| `src/tests/whatsapp/realtime.test.ts` | **Modificar** — o `midiaUrl: null` esperado | 2 |
| `src/app/(app)/atendimento/actions.ts` | **Modificar** — `abrirConversa` assina as URLs | 2 |
| `src/app/(app)/atendimento/Midia.tsx` | **Criar** — os 4 componentes de mídia + lightbox | 3 |
| `src/app/(app)/atendimento/Inbox.tsx` | **Modificar** — remove o `Midia` interno, usa o novo; estado do lightbox | 3 |
| `CHANGELOG.md` | **Modificar** | 4 |

---

### Task 1: `iconeDeMime` — a lógica pura do ícone

**Files:**
- Create: `src/lib/whatsapp/midia.ts`
- Test: `src/tests/whatsapp/midia.test.ts`

**Interfaces:**
- Produces: `iconeDeMime(mime: string | null): "PDF" | "DOC" | "XLS" | "IMG" | "AUDIO" | "ARQ"`.

- [ ] **Step 1: Escrever o teste que falha**

`src/tests/whatsapp/midia.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { iconeDeMime } from "@/lib/whatsapp/midia";

describe("iconeDeMime", () => {
  it("PDF", () => expect(iconeDeMime("application/pdf")).toBe("PDF"));
  it("Word", () => {
    expect(iconeDeMime("application/msword")).toBe("DOC");
    expect(iconeDeMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOC");
  });
  it("Excel", () => {
    expect(iconeDeMime("application/vnd.ms-excel")).toBe("XLS");
    expect(iconeDeMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("XLS");
  });
  it("imagem e áudio", () => {
    expect(iconeDeMime("image/jpeg")).toBe("IMG");
    expect(iconeDeMime("audio/ogg")).toBe("AUDIO");
  });
  it("desconhecido e null viram ARQ", () => {
    expect(iconeDeMime("application/zip")).toBe("ARQ");
    expect(iconeDeMime(null)).toBe("ARQ");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/midia.test.ts`
Expected: FAIL — `iconeDeMime is not a function`.

- [ ] **Step 3: Implementar**

`src/lib/whatsapp/midia.ts`:
```ts
// Ícone curto do documento, derivado do mime — sem depender de coluna nova no banco.
export function iconeDeMime(mime: string | null): "PDF" | "DOC" | "XLS" | "IMG" | "AUDIO" | "ARQ" {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "PDF";
  if (m.includes("word") || m === "application/msword") return "DOC";
  if (m.includes("excel") || m.includes("spreadsheet")) return "XLS";
  if (m.startsWith("image/")) return "IMG";
  if (m.startsWith("audio/")) return "AUDIO";
  return "ARQ";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/midia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/midia.ts src/tests/whatsapp/midia.test.ts
git commit -m "feat(whatsapp): iconeDeMime (icone do documento a partir do mime)"
```

---

### Task 2: A URL assinada — servidor + tipos

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts` (tipo `MsgConversa`, ~linha 3-17)
- Modify: `src/lib/whatsapp/realtime.ts` (`linhaParaMsg`)
- Modify: `src/tests/whatsapp/realtime.test.ts` (o `midiaUrl: null` esperado)
- Modify: `src/app/(app)/atendimento/actions.ts` (`abrirConversa` + `mapMsgs`)

**Interfaces:**
- Consumes: `MsgConversa` (ganha `midiaUrl`).
- Produces: `abrirConversa` retorna mensagens com `midiaUrl` preenchido para as que têm mídia.

- [ ] **Step 1: `MsgConversa` ganha `midiaUrl`**

Em `src/lib/whatsapp/inbox.ts`, no tipo `MsgConversa`, após `midiaMime`:
```ts
  midiaMime: string | null;
  midiaUrl: string | null; // URL assinada (direto do Storage), preenchida por abrirConversa; null no evento Realtime
```

- [ ] **Step 2: Atualizar o `linhaParaMsg` e seu teste**

Em `src/lib/whatsapp/realtime.ts`, no objeto que `linhaParaMsg` retorna, após `midiaMime`:
```ts
    midiaMime: raw.midia_mime ?? null,
    midiaUrl: null, // o evento cru não tem URL assinada; o refetch de ~1s a traz
    cliente: null,
```

Em `src/tests/whatsapp/realtime.test.ts`, no `toEqual` do teste "converte snake_case", adicionar
`midiaUrl: null` (antes de `cliente: null`), senão o teste quebra.

- [ ] **Step 3: `mapMsgs` inicializa `midiaUrl: null`**

Em `src/app/(app)/atendimento/actions.ts`, no objeto que `mapMsgs` retorna (após `midiaMime`):
```ts
      midiaMime: m.midia_mime ?? null,
      midiaUrl: null,
      cliente: (cl as { razao_social?: string } | null)?.razao_social ?? null,
```
> `mapMsgs` continua **síncrono** e sem URL. A assinatura é um passo separado no `abrirConversa` (Step 4).
> A lista (`listarConversas` → `agruparConversas`) usa `mapMsgs` mas **não** precisa de URL — só prévia.

- [ ] **Step 4: `abrirConversa` assina as URLs em batch**

Substituir o `return mapMsgs(data ?? [])` do `abrirConversa` por:
```ts
  const msgs = mapMsgs(data ?? []);
  // Assina as URLs das mídias direto do Storage (uma chamada para todas). Usa o admin: a policy de
  // storage só libera paths na tabela `documentos`, e a mídia do atendimento não tem linha lá — mas a
  // autorização de ver esta conversa já foi feita acima (gate + RLS na leitura das mensagens).
  const paths = msgs.map((m) => m.midiaPath).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const admin = createAdminSupabase();
    const { data: assinadas } = await admin.storage.from("documentos").createSignedUrls(paths, 600);
    // createSignedUrls retorna { path: string|null, signedUrl: string|null, error }[]. Casa por path,
    // ignorando as que falharam (path/signedUrl nulos).
    const porPath = new Map<string, string>();
    for (const a of assinadas ?? []) {
      if (a.path && a.signedUrl) porPath.set(a.path, a.signedUrl);
    }
    for (const m of msgs) {
      if (m.midiaPath) m.midiaUrl = porPath.get(m.midiaPath) ?? null;
    }
  }
  return msgs;
```
> `createSignedUrls(paths, 600)` retorna `{ path, signedUrl, error }[]`. O `porPath` casa cada mídia à
> sua URL. Se um path falhar, `midiaUrl` fica `null` e a UI usa o fallback do proxy. **`createAdminSupabase`
> já está importado** no `actions.ts` (usado em `responder`/`listarConversas`).

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. O teste de `realtime` passa com o `midiaUrl: null`; os de `inbox`/`atendimento` seguem.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(atendimento): abrirConversa assina as URLs de midia (direto do Storage)"
```

---

### Task 3: Os componentes de mídia + o lightbox

**Files:**
- Create: `src/app/(app)/atendimento/Midia.tsx`
- Modify: `src/app/(app)/atendimento/Inbox.tsx` (remove o `Midia` interno; adiciona estado do lightbox)

**Interfaces:**
- Consumes: `MsgConversa` (com `midiaUrl`), `iconeDeMime` (Task 1).
- Produces:
  - `Midia({ msg, onAbrirImagem }: { msg: MsgConversa; onAbrirImagem: (url: string, nome: string) => void })`
  - `Lightbox({ url, nome, onFechar }: { url: string; nome: string; onFechar: () => void })`

- [ ] **Step 1: Criar `Midia.tsx`**

`src/app/(app)/atendimento/Midia.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import type { MsgConversa } from "@/lib/whatsapp/inbox";
import { iconeDeMime } from "@/lib/whatsapp/midia";

// A cor do selo do documento por tipo (usa o brand kit).
const COR_SELO: Record<string, string> = {
  PDF: "bg-negativo",
  DOC: "bg-[#2f80ed]",
  XLS: "bg-verde",
  ARQ: "bg-cinza",
  IMG: "bg-cinza",
  AUDIO: "bg-cinza",
};

export function Midia({
  msg,
  onAbrirImagem,
}: {
  msg: MsgConversa;
  onAbrirImagem: (url: string, nome: string) => void;
}) {
  if (!msg.midiaTipo || !msg.midiaPath) return null;
  // Fallback: se a URL assinada não veio (evento Realtime / erro ao assinar), usa o proxy.
  const src = msg.midiaUrl ?? `/api/atendimento/midia/${msg.id}`;
  const nome = msg.midiaNome ?? "arquivo";

  if (msg.midiaTipo === "image") {
    return (
      <button
        type="button"
        onClick={() => onAbrirImagem(src, nome)}
        className="block overflow-hidden rounded-xl"
        aria-label={`Abrir imagem ${nome}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={nome} className="h-[170px] w-60 object-cover transition hover:brightness-95" />
      </button>
    );
  }

  if (msg.midiaTipo === "audio") {
    // Áudio de voz do WhatsApp não tem legendas; a regra de caption não se aplica.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={src} className="w-64 max-w-full" />;
  }

  // documento
  const selo = iconeDeMime(msg.midiaMime);
  return (
    <a
      href={`/api/atendimento/midia/${msg.id}`}
      download={nome}
      className="flex w-64 items-center gap-3 rounded-xl border border-linha bg-white px-3 py-2.5 text-texto hover:bg-creme"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${COR_SELO[selo]}`}>
        {selo}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</span>
      <span aria-hidden className="text-cinza-claro">
        ⤓
      </span>
    </a>
  );
}

export function Lightbox({ url, nome, onFechar }: { url: string; nome: string; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem ${nome}`}
    >
      <button type="button" onClick={onFechar} aria-label="Fechar" className="absolute right-5 top-4 text-2xl text-white/80 hover:text-white">
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nome} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg" />
      <a
        href={url}
        download={nome}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 text-sm text-white/80 hover:text-white"
      >
        {nome} · baixar ⤓
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Remover o `Midia` interno do `Inbox.tsx`**

Apagar a função `function Midia({ msg }: { msg: MsgConversa }) { … }` inteira (a de hoje, ~linha 617).

- [ ] **Step 3: Importar o novo `Midia`/`Lightbox` e adicionar o estado**

No topo do `Inbox.tsx` (perto dos outros imports de `./`):
```tsx
import { Midia, Lightbox } from "./Midia";
```
No corpo do componente `Inbox`, junto aos outros `useState`:
```tsx
  const [lightbox, setLightbox] = useState<{ url: string; nome: string } | null>(null);
```

- [ ] **Step 4: Passar o callback onde `<Midia>` é usado**

O uso está em `Inbox.tsx:487` — hoje `<Midia msg={m} />`. Trocar por:
```tsx
<Midia msg={m} onAbrirImagem={(url, nome) => setLightbox({ url, nome })} />
```
E, no fim do JSX do `Inbox` (antes de fechar o container raiz), renderizar o lightbox:
```tsx
{lightbox && <Lightbox url={lightbox.url} nome={lightbox.nome} onFechar={() => setLightbox(null)} />}
```

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde.

- [ ] **Step 6: Conferir na tela** — `npm run dev`, abrir uma conversa com mídia: a imagem é miniatura
  recortada e clicar abre o lightbox escuro (fecha no ✕, clique fora, Esc); o áudio tem player; o
  documento é cartão com selo do tipo e ⤓.

- [ ] **Step 7: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(atendimento): baloes de midia estilo WhatsApp (miniatura, player, cartao, lightbox)"
```

---

### Task 4: Documentar e entregar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG — em `[Não lançado]`**

```markdown
### Adicionado

- **Atendimento — mídia como no WhatsApp:** os arquivos abrem **rápido** (URL assinada, direto do
  Storage — o servidor deixa de re-baixar cada arquivo a cada visualização) e aparecem com **cara de
  WhatsApp**: a imagem é miniatura clicável que abre num visualizador escuro (lightbox), o áudio tem
  player, e o documento é um cartão com ícone do tipo e botão de baixar.
```

- [ ] **Step 2: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 3: PR**

```bash
git add -A
git commit -m "docs: registra a midia do atendimento estilo WhatsApp"
git push origin develop
gh pr create --base main --head develop --title "Atendimento: midia como no WhatsApp (velocidade + aparencia)"
gh pr checks --watch
```

- [ ] **Step 4: A release, na ordem certa**

> **Sem migration, sem infra nova.** Esta fatia é só código (URL assinada + componentes) — nada a rodar no
> banco antes do deploy. Depois do merge: **Implantar** no EasyPanel → conferir `/api/health` → e, se for
> lançar versão, o bump de `package.json` + CHANGELOG no mesmo PR, com a tag depois do health. Ver
> `docs/VERSIONAMENTO.md`.
