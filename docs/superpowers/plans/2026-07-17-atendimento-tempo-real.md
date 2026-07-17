# Atendimento em tempo real — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-17-atendimento-tempo-real-design.md`.

**Objetivo:** as mensagens do Atendimento aparecem no instante em que chegam, via Supabase Realtime, em
vez de esperar o polling de 4s/15s.

**Arquitetura:** o navegador assina as inserções/updates de `whatsapp_mensagem` por WebSocket (com o
client autenticado, respeitando a RLS). Um hook isolado converte o evento cru na `MsgConversa` da UI e
avisa o `Inbox`; o polling cai para 30s, só como rede de segurança.

**Stack:** Next.js 16 (App Router), Supabase Realtime (`@supabase/supabase-js` 2.108), TypeScript, vitest.

## Global Constraints

- **Nenhuma mudança no envio, no webhook, na RLS, no casamento de cliente ou na mídia** — esta fatia é só
  velocidade de recebimento.
- **A RLS protege o tempo real:** a assinatura usa o client **autenticado** do browser
  (`createBrowserSupabase`), nunca o admin/service_role. Um contador não recebe mensagem de cliente alheio.
- **Polling mantido a 30s** como backup (o WebSocket pode cair no proxy do EasyPanel).
- **Dedup por `id`:** um evento de mensagem cujo `id` já está na thread não duplica.
- **Migrations imutáveis; nova migration idempotente** (`do $$ … exception when duplicate_object then
  null; end $$;`). Aplicar com `npm run db:migrate` (NÃO `supabase db push`).
- **`main` protegido:** entrega por PR de `develop` com o `verify` verde.
- **O merge NÃO publica.** Deploy = **Implantar** no EasyPanel; confirmar em `/api/health`. Tag depois.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/0100_realtime_atendimento.sql` | **Criar** — habilita Realtime nas tabelas | 1 |
| `src/lib/whatsapp/realtime.ts` | **Criar** — a lógica pura: linha crua → `MsgConversa`, e a decisão de roteamento | 2 |
| `src/tests/whatsapp/realtime.test.ts` | **Criar** — testa a lógica pura sem WebSocket | 2 |
| `src/lib/whatsapp/useRealtimeAtendimento.ts` | **Criar** — o hook React (assinatura + reconexão) | 3 |
| `src/app/(app)/atendimento/Inbox.tsx` | **Modificar** — troca os 2 setInterval pelo hook + backup 30s | 3 |

---

### Task 1: Habilitar o Realtime nas tabelas

**Files:**
- Create: `supabase/migrations/0100_realtime_atendimento.sql`

**Interfaces:**
- Produces: as tabelas `whatsapp_mensagem` e `conversa` na publicação `supabase_realtime`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0100_realtime_atendimento.sql
-- Habilita o Supabase Realtime nas tabelas do atendimento: o Postgres passa a emitir os eventos
-- de INSERT/UPDATE pelo WebSocket. O Realtime aplica a RLS de cada tabela na entrega.
-- Idempotente: `add table` erra com duplicate_object se a tabela já está na publicação — ignoramos.
do $$ begin
  alter publication supabase_realtime add table whatsapp_mensagem;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table conversa;
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0100`. Se `SUPABASE_DB_URL` não estiver setado, avisar o Pedro (banco de dev). Não
seguir sem aplicar.

- [ ] **Step 3: Confirmar que a publicação pegou**

```bash
# via o mesmo runner/psql, ou pedir ao Pedro rodar no SQL Editor de dev:
# select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
Esperado: a lista inclui `whatsapp_mensagem` e `conversa`. (Registrar; não bloquear se o comando de
inspeção não estiver à mão — o Step 2 já confirma que rodou.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0100_realtime_atendimento.sql
git commit -m "feat(db): habilita Supabase Realtime no atendimento"
```

---

### Task 2: A lógica pura — evento cru → MsgConversa + roteamento

**Files:**
- Create: `src/lib/whatsapp/realtime.ts`
- Test: `src/tests/whatsapp/realtime.test.ts`

**Interfaces:**
- Consumes: o tipo `MsgConversa` de `@/lib/whatsapp/inbox`.
- Produces:
  - `type LinhaMensagemRaw` — a linha crua da tabela (snake_case) que o Realtime entrega.
  - `linhaParaMsg(raw: LinhaMensagemRaw): MsgConversa` — converte snake→camel (o mesmo mapa de
    `abrirConversa`, sem o join de cliente — o Realtime não traz `clientes`).
  - `rotearEvento(raw, telefoneAtivo, idsNaThread): { paraThread: boolean; listaMudou: boolean }` — decide
    o que fazer com o evento.

**Contexto:** o webhook grava `telefone` já como chave canônica (`chaveDeNumeroCompleto`), e o `ativa` do
Inbox é esse mesmo telefone. Então a comparação é `raw.telefone === telefoneAtivo` — sem re-canonicalizar.

- [ ] **Step 1: Escrever os testes que falham**

`src/tests/whatsapp/realtime.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { linhaParaMsg, rotearEvento, type LinhaMensagemRaw } from "@/lib/whatsapp/realtime";

const raw: LinhaMensagemRaw = {
  id: "m1",
  telefone: "5534988403020",
  texto: "oi",
  direcao: "IN",
  lida: false,
  criado_em: "2026-07-17T12:00:00Z",
  status: "recebida",
  midia_tipo: null,
  midia_path: null,
  midia_nome: null,
  midia_mime: null,
};

describe("linhaParaMsg", () => {
  it("converte snake_case da tabela para a MsgConversa da UI", () => {
    expect(linhaParaMsg(raw)).toEqual({
      id: "m1",
      telefone: "5534988403020",
      texto: "oi",
      direcao: "IN",
      lida: false,
      criado_em: "2026-07-17T12:00:00Z",
      status: "recebida",
      midiaTipo: null,
      midiaPath: null,
      midiaNome: null,
      midiaMime: null,
      cliente: null, // o Realtime não traz o join de cliente
    });
  });
  it("mapeia a mídia quando presente", () => {
    const comMidia = { ...raw, midia_tipo: "image", midia_path: "p/x.jpg", midia_nome: "x.jpg", midia_mime: "image/jpeg" };
    const m = linhaParaMsg(comMidia);
    expect(m.midiaTipo).toBe("image");
    expect(m.midiaPath).toBe("p/x.jpg");
  });
});

describe("rotearEvento", () => {
  it("mensagem da conversa aberta vai para a thread E marca a lista", () => {
    expect(rotearEvento(raw, "5534988403020", new Set())).toEqual({ paraThread: true, listaMudou: true });
  });
  it("mensagem de outra conversa só marca a lista", () => {
    expect(rotearEvento(raw, "5511999998888", new Set())).toEqual({ paraThread: false, listaMudou: true });
  });
  it("sem conversa aberta, só marca a lista", () => {
    expect(rotearEvento(raw, null, new Set())).toEqual({ paraThread: false, listaMudou: true });
  });
  it("id já na thread não vai de novo para a thread (dedup), mas ainda pode marcar a lista", () => {
    expect(rotearEvento(raw, "5534988403020", new Set(["m1"]))).toEqual({ paraThread: false, listaMudou: true });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/realtime.test.ts`
Expected: FAIL — `linhaParaMsg is not a function`.

- [ ] **Step 3: Implementar**

`src/lib/whatsapp/realtime.ts`:
```ts
import type { MsgConversa } from "@/lib/whatsapp/inbox";

// A linha crua que o Supabase Realtime entrega no evento (snake_case, como a tabela).
export type LinhaMensagemRaw = {
  id: string;
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  status?: string | null;
  midia_tipo?: string | null;
  midia_path?: string | null;
  midia_nome?: string | null;
  midia_mime?: string | null;
};

// Converte a linha crua na MsgConversa da UI. Mesmo mapa de abrirConversa, SEM o join de cliente —
// o Realtime entrega só a linha da tabela, não o razao_social casado. O nome vem no refetch da lista.
export function linhaParaMsg(raw: LinhaMensagemRaw): MsgConversa {
  return {
    id: raw.id,
    telefone: raw.telefone,
    texto: raw.texto,
    direcao: raw.direcao,
    lida: raw.lida,
    criado_em: raw.criado_em,
    status: raw.status ?? "",
    midiaTipo: raw.midia_tipo ?? null,
    midiaPath: raw.midia_path ?? null,
    midiaNome: raw.midia_nome ?? null,
    midiaMime: raw.midia_mime ?? null,
    cliente: null,
  };
}

// Decide o que fazer com um evento de INSERT. O telefone já é chave canônica nos dois lados.
export function rotearEvento(
  raw: LinhaMensagemRaw,
  telefoneAtivo: string | null,
  idsNaThread: Set<string>,
): { paraThread: boolean; listaMudou: boolean } {
  const daConversaAberta = telefoneAtivo !== null && raw.telefone === telefoneAtivo;
  const paraThread = daConversaAberta && !idsNaThread.has(raw.id);
  return { paraThread, listaMudou: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/realtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/realtime.ts src/tests/whatsapp/realtime.test.ts
git commit -m "feat(whatsapp): logica pura do tempo real (evento -> MsgConversa + roteamento)"
```

---

### Task 3: O hook + a troca no Inbox

**Files:**
- Create: `src/lib/whatsapp/useRealtimeAtendimento.ts`
- Modify: `src/app/(app)/atendimento/Inbox.tsx:92-108` (os dois setInterval)

**Interfaces:**
- Consumes: `linhaParaMsg`, `rotearEvento`, `LinhaMensagemRaw` (Task 2); `createBrowserSupabase` de
  `@/lib/supabase/client`.
- Produces:
  ```ts
  useRealtimeAtendimento(opts: {
    telefoneAtivo: string | null;
    onMensagemNaConversa: (msg: MsgConversa) => void;
    onListaMudou: () => void;
  }): { conectado: boolean };
  ```

- [ ] **Step 1: Escrever o hook**

`src/lib/whatsapp/useRealtimeAtendimento.ts`:
```ts
"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { linhaParaMsg, rotearEvento, type LinhaMensagemRaw } from "@/lib/whatsapp/realtime";
import type { MsgConversa } from "@/lib/whatsapp/inbox";

export function useRealtimeAtendimento(opts: {
  telefoneAtivo: string | null;
  onMensagemNaConversa: (msg: MsgConversa) => void;
  onListaMudou: () => void;
}): { conectado: boolean } {
  const [conectado, setConectado] = useState(false);
  // refs para o callback do canal enxergar sempre o valor atual sem re-assinar a cada render.
  const ref = useRef(opts);
  ref.current = opts;
  const idsThread = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const canal = supabase
      .channel("atendimento")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagem" },
        (payload) => {
          const raw = payload.new as LinhaMensagemRaw;
          const { paraThread, listaMudou } = rotearEvento(raw, ref.current.telefoneAtivo, idsThread.current);
          if (paraThread) {
            idsThread.current.add(raw.id);
            ref.current.onMensagemNaConversa(linhaParaMsg(raw));
          }
          if (listaMudou) ref.current.onListaMudou();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_mensagem" },
        () => ref.current.onListaMudou(), // status entregue→lido: o refetch traz o tick novo
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));

    // aba que dormiu: ao voltar, força um refetch (o WebSocket pode ter perdido eventos).
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ref.current.onListaMudou();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(canal);
    };
  }, []);

  // quando a conversa aberta muda, zera o dedup de ids da thread.
  useEffect(() => {
    idsThread.current = new Set();
  }, [opts.telefoneAtivo]);

  return { conectado };
}
```

> **Por que os refs:** o canal é assinado uma vez (deps `[]`) para não reconectar a cada tecla digitada.
> O `ref.current` dá ao callback o `telefoneAtivo`/callbacks atuais sem re-assinar. É o padrão para
> assinaturas de longa duração em React.

- [ ] **Step 2: Trocar o polling no Inbox**

Em `src/app/(app)/atendimento/Inbox.tsx`, **remover** os dois `useEffect` de polling (linhas ~92 e ~102,
os de 15000 e 4000) e **substituir** por:

```tsx
  // Tempo real: mensagem nova aparece na hora (Supabase Realtime). A lista faz refetch leve,
  // com debounce para não refazer a cada mensagem de uma rajada.
  const debounceLista = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { conectado } = useRealtimeAtendimento({
    telefoneAtivo: ativa,
    onMensagemNaConversa: (msg) => setMsgs((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg])),
    onListaMudou: () => {
      if (debounceLista.current) clearTimeout(debounceLista.current);
      debounceLista.current = setTimeout(() => {
        start(async () => {
          setConversas(await listarConversas());
          if (ativa) setMsgs(await abrirConversa(ativa));
        });
      }, 1000);
    },
  });

  // Rede de segurança: se o WebSocket cair, um refetch a cada 30s ressincroniza.
  useEffect(() => {
    const id = setInterval(() => {
      start(async () => {
        setConversas(await listarConversas());
        if (ativa) setMsgs(await abrirConversa(ativa));
      });
    }, 30000);
    return () => clearInterval(id);
  }, [ativa]);
```

Adicionar o import no topo do `Inbox.tsx`:
```tsx
import { useRealtimeAtendimento } from "@/lib/whatsapp/useRealtimeAtendimento";
```
O `useRef` já está no import de `react` do `Inbox` (`useEffect, useState, useTransition, useCallback,
useRef`) — nada a adicionar ali.

> **Dedup do eco de envio:** a UI já acrescenta a mensagem enviada na hora (no `responder`). O
> `onMensagemNaConversa` só adiciona se o `id` ainda não está na thread (`m.some((x) => x.id === msg.id)`),
> então o evento Realtime da própria mensagem enviada não duplica.

- [ ] **Step 3: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. Os testes de `inbox`/`atendimento` seguem passando (a lógica de `agruparConversas` etc.
não mudou).

- [ ] **Step 4: Teste manual (o teste real do tempo real)**

Com a migration aplicada no dev: `npm run dev`, abrir `/atendimento` em **duas abas**. Numa aba, enviar
mensagem numa conversa; na outra, a mensagem deve aparecer **na hora** (não em 4s). Conferir que o
contador da lista acende sem abrir a conversa. Se não funcionar, checar o console por erro de canal
(`CHANNEL_ERROR`) e confirmar que a `0100` foi aplicada.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/useRealtimeAtendimento.ts src/app/\(app\)/atendimento/Inbox.tsx
git commit -m "feat(atendimento): tempo real via Supabase Realtime; polling vira backup de 30s"
```

---

### Task 4: Documentar e entregar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG — em `[Não lançado]`**

```markdown
### Adicionado

- **Atendimento em tempo real:** as mensagens do WhatsApp passam a aparecer no **instante** em que
  chegam (Supabase Realtime), em vez de esperar o polling — que era de 4s na conversa aberta e 15s na
  lista. A conversa aberta e a lista reagem na hora; o polling continua como rede de segurança, agora a
  30s, para o caso de o WebSocket cair. A RLS existente protege a assinatura: um contador não recebe, em
  tempo real, mensagem de cliente que não é dele.
```

- [ ] **Step 2: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 3: PR**

```bash
git add -A
git commit -m "docs: registra o atendimento em tempo real"
git push origin develop
gh pr create --base main --head develop --title "Atendimento em tempo real (Supabase Realtime)"
gh pr checks --watch
```

- [ ] **Step 4: A release, na ordem certa**

> **Migration em produção antes do deploy.** A `0100` habilita o Realtime — precisa rodar no banco de
> **produção** antes de o EasyPanel servir o código novo (o Pedro aplica no SQL Editor, como as
> anteriores). Depois: **Implantar** → conferir `/api/health` → e, se for lançar versão, o bump de
> `package.json` + CHANGELOG no mesmo PR, com a tag depois do health. Ver `docs/VERSIONAMENTO.md`.
>
> **Atenção — o Realtime precisa estar ligado no projeto Supabase.** Além da migration (que põe a tabela
> na publicação), o Realtime é um serviço que pode estar desligado no plano/free. Confirmar no painel do
> Supabase de produção (Database → Replication, ou Project Settings) que o Realtime está ativo. Se
> estiver desligado, o código não quebra — só cai no polling de 30s (degrada com elegância).
