# Atendimento — Fatia A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformar o Atendimento em tela de página inteira (3 colunas), com chat estilo WhatsApp (separador por dia + horário), lista com busca/abas/favoritar/nova conversa, e painel do contato.

**Architecture:** Mantém Server Actions + client component com polling. Adiciona tabela `conversa` (favoritos), helpers puros em `inbox.ts`, novas actions, e reescreve `Inbox.tsx` para o layout full-page. Spec: `docs/superpowers/specs/2026-07-06-atendimento-fatia-a-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind 4, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Todos devem passar.
- Migrations: arquivo novo em `supabase/migrations/`, aplicado por `npm run db:migrate` (NUNCA `supabase db push`). Idempotente (`create table if not exists`, `drop policy if exists`). Migrations já aplicadas são imutáveis. Atinge produção imediatamente.
- Papel (RBAC) fonte única: `auth_papel()` no SQL; `podeAtender`/`podeVerHonorario` no app. Nunca ler papel do JWT.
- Tokens de design SALDO: `verde`, `texto`, `cinza`, `cinza-claro`, `linha`, `creme`, `branco`. Fontes `font-display` (Space Grotesk) / `font-mono`.
- Trabalhar em branch (não `main`/`develop` direto): `git checkout -b feat/atendimento-fatia-a develop`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `supabase/migrations/0041_conversa.sql` — **novo**: tabela `conversa` + RLS.
- `src/lib/whatsapp/inbox.ts` — **modificar**: tipo `Conversa` (+`favorita`), `agruparConversas` (param favoritos), e helpers puros novos (`horaMsg`, `separadorDia`, `filtrarConversas`, `contadores`, tipo `FiltroAba`).
- `src/tests/whatsapp/inbox.test.ts` — **modificar**: testes dos helpers + `agruparConversas` com favoritos.
- `src/app/(app)/atendimento/actions.ts` — **modificar**: `listarConversas` (favoritos) + novas `favoritarConversa`, `marcarTodasLidas`, `dadosContato`, `iniciarConversa`; tipo `DadosContato`.
- `src/app/(app)/atendimento/Inbox.tsx` — **reescrever**: layout 3 colunas.
- `src/app/(app)/atendimento/page.tsx` — **modificar**: full-bleed.
- `src/tests/atendimento/inbox-render.test.tsx` — **novo**: smoke de render.

---

## Task 1: Migration `conversa` (favoritos + RLS)

**Files:**
- Create: `supabase/migrations/0041_conversa.sql`

**Interfaces:**
- Produces: tabela `conversa(telefone text pk, favorita bool, criado_em timestamptz)` com RLS para `admin/financeiro/contador`.

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/0041_conversa.sql`:

```sql
-- Metadados por conversa (derivada de whatsapp_mensagem por telefone).
-- Fatia A: apenas o marcador de favorito. Extensível na Fatia C (status/atendente).
create table if not exists conversa (
  telefone   text primary key,
  favorita   boolean not null default false,
  criado_em  timestamptz not null default now()
);
alter table conversa enable row level security;

do $$ begin
  drop policy if exists conversa_all on conversa;
  create policy conversa_all on conversa for all to authenticated
    using (auth_papel() in ('admin','financeiro','contador'))
    with check (auth_papel() in ('admin','financeiro','contador'));
end $$;
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:migrate`
Expected: aplica `0041_conversa` sem erro (registrada em `app_migrations`).

- [ ] **Step 3: Verificar tabela + policy**

Run:
```bash
node --env-file=.env.local -e "import('./scripts/_db.mjs').then(async({makeClient})=>{const c=makeClient();await c.connect();const t=await c.query(\"select 1 from information_schema.tables where table_name='conversa'\");const p=await c.query(\"select policyname from pg_policies where tablename='conversa'\");console.log('tabela:',t.rowCount,'| policies:',p.rows.map(r=>r.policyname));await c.end();});"
```
Expected: `tabela: 1 | policies: [ 'conversa_all' ]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0041_conversa.sql
git commit -m "feat(atendimento): tabela conversa (favoritos) + RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers puros em `inbox.ts` (TDD)

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts`
- Test: `src/tests/whatsapp/inbox.test.ts`

**Interfaces:**
- Consumes: tipo `Conversa`, `MsgConversa` (existentes).
- Produces:
  - `Conversa` estendido com `favorita: boolean`.
  - `agruparConversas(msgs: MsgConversa[], favoritos?: Set<string>): Conversa[]`.
  - `type FiltroAba = "todas" | "nao_lidas" | "favoritos"`.
  - `horaMsg(iso: string): string` → `"HH:MM"`.
  - `separadorDia(iso: string, hojeIso: string): string` → `"hoje"|"ontem"|"dd/mm/aaaa"`.
  - `filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[]`.
  - `contadores(convs: Conversa[]): { todas: number; nao_lidas: number; favoritos: number }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/tests/whatsapp/inbox.test.ts`, adicionar os imports novos e um bloco de testes ao final do arquivo:

```ts
import {
  horaMsg,
  separadorDia,
  filtrarConversas,
  contadores,
  type Conversa,
} from "@/lib/whatsapp/inbox";

const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534999990000",
  cliente: null,
  ultima: "oi",
  ultima_em: "2026-07-06T12:00:00.000Z",
  nao_lidas: 0,
  favorita: false,
  ...over,
});

describe("horaMsg", () => {
  it("formata HH:MM 24h com zero-pad", () => {
    // meia-noite e nove local
    const d = new Date(2026, 6, 6, 0, 9, 0);
    expect(horaMsg(d.toISOString())).toBe("00:09");
  });
});

describe("separadorDia", () => {
  const hoje = new Date(2026, 6, 6, 10, 0, 0).toISOString();
  it("mesma data → hoje", () => {
    expect(separadorDia(new Date(2026, 6, 6, 8, 0).toISOString(), hoje)).toBe("hoje");
  });
  it("um dia antes → ontem", () => {
    expect(separadorDia(new Date(2026, 6, 5, 23, 0).toISOString(), hoje)).toBe("ontem");
  });
  it("mais antigo → dd/mm/aaaa", () => {
    expect(separadorDia(new Date(2026, 6, 1, 8, 0).toISOString(), hoje)).toBe("01/07/2026");
  });
});

describe("filtrarConversas", () => {
  const convs = [
    conv({ telefone: "111", cliente: "Moura Purcell", nao_lidas: 2, favorita: true }),
    conv({ telefone: "5534988887777", cliente: null, nao_lidas: 0, favorita: false }),
    conv({ telefone: "333", cliente: "Jessica", nao_lidas: 1, favorita: false }),
  ];
  it("aba todas sem busca → todas", () => {
    expect(filtrarConversas(convs, "todas", "").length).toBe(3);
  });
  it("aba nao_lidas → só com nao_lidas>0", () => {
    expect(filtrarConversas(convs, "nao_lidas", "").map((c) => c.telefone)).toEqual(["111", "333"]);
  });
  it("aba favoritos → só favoritas", () => {
    expect(filtrarConversas(convs, "favoritos", "").map((c) => c.telefone)).toEqual(["111"]);
  });
  it("busca por nome (case-insensitive)", () => {
    expect(filtrarConversas(convs, "todas", "moura").map((c) => c.telefone)).toEqual(["111"]);
  });
  it("busca por telefone", () => {
    expect(filtrarConversas(convs, "todas", "8888").map((c) => c.telefone)).toEqual(["5534988887777"]);
  });
});

describe("contadores", () => {
  it("conta por conversa (não por mensagem)", () => {
    const convs = [
      conv({ nao_lidas: 3, favorita: true }),
      conv({ nao_lidas: 0, favorita: false }),
      conv({ nao_lidas: 1, favorita: false }),
    ];
    expect(contadores(convs)).toEqual({ todas: 3, nao_lidas: 2, favoritos: 1 });
  });
});

describe("agruparConversas favoritos", () => {
  it("marca favorita quando o telefone está no set", () => {
    const msgs: MsgConversa[] = [
      { telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z" },
    ];
    const [c] = agruparConversas(msgs, new Set(["111"]));
    expect(c!.favorita).toBe(true);
  });
  it("default sem favoritos → favorita false", () => {
    const msgs: MsgConversa[] = [
      { telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z" },
    ];
    expect(agruparConversas(msgs)[0]!.favorita).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm test -- inbox`
Expected: FAIL (funções `horaMsg`/`separadorDia`/`filtrarConversas`/`contadores` inexistentes; `favorita` ausente).

- [ ] **Step 3: Implementar em `inbox.ts`**

Alterar o tipo `Conversa` (adicionar `favorita`), a assinatura de `agruparConversas`, e adicionar os helpers. Substituir o tipo e a função `agruparConversas` existentes por:

```ts
export type Conversa = {
  telefone: string;
  cliente: string | null;
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
};

export type FiltroAba = "todas" | "nao_lidas" | "favoritos";

// Agrupa mensagens por telefone → conversas, mais recente primeiro. `favoritos` marca a estrela.
export function agruparConversas(msgs: MsgConversa[], favoritos: Set<string> = new Set()): Conversa[] {
  const porTel = new Map<string, MsgConversa[]>();
  for (const m of msgs) {
    const arr = porTel.get(m.telefone) ?? [];
    arr.push(m);
    porTel.set(m.telefone, arr);
  }
  const convs: Conversa[] = [];
  for (const [telefone, arr] of porTel) {
    const ordenadas = [...arr].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const ultima = ordenadas[ordenadas.length - 1]!;
    const cliente = ordenadas.find((m) => m.cliente)?.cliente ?? null;
    convs.push({
      telefone,
      cliente,
      ultima: ultima.texto,
      ultima_em: ultima.criado_em,
      nao_lidas: arr.filter((m) => m.direcao === "IN" && !m.lida).length,
      favorita: favoritos.has(telefone),
    });
  }
  return convs.sort((a, b) => b.ultima_em.localeCompare(a.ultima_em));
}

// "HH:MM" 24h da data local.
export function horaMsg(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "hoje" / "ontem" / "dd/mm/aaaa" comparando as datas locais.
export function separadorDia(iso: string, hojeIso: string): string {
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const d = new Date(iso);
  const hoje = new Date(hojeIso);
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (ymd(d) === ymd(hoje)) return "hoje";
  if (ymd(d) === ymd(ontem)) return "ontem";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Filtra por aba + busca (nome do cliente OU telefone), mantendo a ordem já vinda de agruparConversas.
export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[] {
  const termo = busca.trim().toLowerCase();
  return convs.filter((c) => {
    if (aba === "nao_lidas" && c.nao_lidas === 0) return false;
    if (aba === "favoritos" && !c.favorita) return false;
    if (termo) {
      const alvo = `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`;
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// Contadores para os badges das abas (por CONVERSA, não por mensagem).
export function contadores(convs: Conversa[]): { todas: number; nao_lidas: number; favoritos: number } {
  return {
    todas: convs.length,
    nao_lidas: convs.filter((c) => c.nao_lidas > 0).length,
    favoritos: convs.filter((c) => c.favorita).length,
  };
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm test -- inbox`
Expected: PASS (todos, incluindo os antigos de `extrairMensagemZapi`/`agruparConversas`).

> Se algum teste antigo de `agruparConversas` usava `toEqual` no objeto inteiro e quebrou por causa do novo campo `favorita`, atualize-o para incluir `favorita: false`.

- [ ] **Step 5: Verificar lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/inbox.ts src/tests/whatsapp/inbox.test.ts
git commit -m "feat(atendimento): helpers de data/hora/filtro + favoritos em agruparConversas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actions do atendimento

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts`

**Interfaces:**
- Consumes: `gate()`, `mapMsgs()`, `responder()` (existentes); `agruparConversas` (Task 2); `createServerSupabase`, `createAdminSupabase`, `normalizarTelefone` (já importados); `podeVerHonorario` (importar de `@/lib/clientes/permissoes`).
- Produces:
  - `listarConversas()` agora inclui favoritos.
  - `favoritarConversa(telefone: string, favorita: boolean): Promise<{ ok?: boolean; erro?: string }>`.
  - `marcarTodasLidas(): Promise<{ ok?: boolean }>`.
  - `type DadosContato` + `dadosContato(telefone: string): Promise<DadosContato>`.
  - `iniciarConversa(telefone: string, texto: string): Promise<{ ok?: boolean; erro?: string }>`.

- [ ] **Step 1: Adicionar import de `podeVerHonorario`**

No topo de `actions.ts`, trocar a linha de import de permissões:

```ts
import { podeAtender, podeVerHonorario } from "@/lib/clientes/permissoes";
```

- [ ] **Step 2: Substituir `listarConversas` (incluir favoritos)**

```ts
export async function listarConversas(): Promise<Conversa[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_mensagem")
    .select("telefone, texto, direcao, lida, criado_em, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(500);
  const { data: favs } = await supabase.from("conversa").select("telefone").eq("favorita", true);
  const favoritos = new Set((favs ?? []).map((f) => f.telefone as string));
  return agruparConversas(mapMsgs(data ?? []), favoritos);
}
```

- [ ] **Step 3: Adicionar as novas actions ao final de `actions.ts`**

```ts
export async function favoritarConversa(
  telefone: string,
  favorita: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("conversa").upsert({ telefone, favorita }, { onConflict: "telefone" });
  return error ? { erro: "Falha ao favoritar." } : { ok: true };
}

export async function marcarTodasLidas(): Promise<{ ok?: boolean }> {
  if (!(await gate())) return {};
  const supabase = await createServerSupabase();
  await supabase.from("whatsapp_mensagem").update({ lida: true }).eq("direcao", "IN").eq("lida", false);
  return { ok: true };
}

export type DadosContato = {
  telefone: string;
  clienteId: string | null;
  razaoSocial: string | null;
  regime: string | null;
  cnpjCpf: string | null;
  honorario: number | null;
  situacao: string | null;
};

export async function dadosContato(telefone: string): Promise<DadosContato> {
  const vazio: DadosContato = {
    telefone, clienteId: null, razaoSocial: null, regime: null, cnpjCpf: null, honorario: null, situacao: null,
  };
  const perfil = await gate();
  if (!perfil) return vazio;
  // Resolve o cliente casado pelo telefone (mesma lógica de responder: casa se houver exatamente um).
  const admin = createAdminSupabase();
  const { data: cli } = await admin
    .from("clientes")
    .select("id, telefone, razao_social, cpf_cnpj, regime_tributario, status");
  const casados = (cli ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === telefone);
  if (casados.length !== 1) return vazio;
  const c = casados[0]!;
  let honorario: number | null = null;
  if (podeVerHonorario(perfil.papel)) {
    const { data: fin } = await admin
      .from("clientes_financeiro")
      .select("honorario_mensal")
      .eq("cliente_id", c.id)
      .maybeSingle();
    honorario = (fin?.honorario_mensal as number | null) ?? null;
  }
  return {
    telefone,
    clienteId: c.id as string,
    razaoSocial: c.razao_social as string,
    regime: c.regime_tributario as string,
    cnpjCpf: c.cpf_cnpj as string,
    honorario,
    situacao: c.status as string,
  };
}

export async function iniciarConversa(
  telefone: string,
  texto: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const t = normalizarTelefone(telefone);
  if (!t) return { erro: "Telefone inválido." };
  return responder(t, texto);
}
```

- [ ] **Step 4: Verificar lint/typecheck/build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: sem erros; rota `/atendimento` compila.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/atendimento/actions.ts"
git commit -m "feat(atendimento): actions favoritar/marcar-lidas/dados-contato/iniciar-conversa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Reescrever `Inbox.tsx` (3 colunas) + página full-bleed + smoke

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`
- Modify: `src/app/(app)/atendimento/page.tsx`
- Test: `src/tests/atendimento/inbox-render.test.tsx`

**Interfaces:**
- Consumes: `listarConversas`, `abrirConversa`, `responder`, `favoritarConversa`, `marcarTodasLidas`, `dadosContato`, `iniciarConversa`, `type DadosContato` (Task 3); `Conversa`, `MsgConversa`, `FiltroAba`, `horaMsg`, `separadorDia`, `filtrarConversas`, `contadores` (Task 2); `iniciais` de `@/lib/ui/apresentacao`.

- [ ] **Step 1: Escrever o smoke test que falha**

Criar `src/tests/atendimento/inbox-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "@/app/(app)/atendimento/Inbox";
import type { Conversa } from "@/lib/whatsapp/inbox";

const convs: Conversa[] = [
  { telefone: "111", cliente: "Moura Purcell", ultima: "oi", ultima_em: "2026-07-06T10:00:00Z", nao_lidas: 2, favorita: true },
];

describe("Inbox", () => {
  it("renderiza a lista e as abas sem lançar", () => {
    const html = renderToStaticMarkup(<Inbox inicial={convs} />);
    expect(html).toContain("Atendimento");
    expect(html).toContain("Todas");
    expect(html).toContain("Moura Purcell");
  });
  it("renderiza vazio sem lançar", () => {
    expect(() => renderToStaticMarkup(<Inbox inicial={[]} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- inbox-render`
Expected: FAIL (o `Inbox` novo ainda não expõe "Todas"/abas; ou compila diferente).

- [ ] **Step 3: Reescrever `Inbox.tsx`**

Substituir todo o conteúdo de `src/app/(app)/atendimento/Inbox.tsx` por:

```tsx
"use client";
import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  listarConversas,
  abrirConversa,
  responder,
  favoritarConversa,
  marcarTodasLidas,
  dadosContato,
  iniciarConversa,
  type DadosContato,
} from "./actions";
import {
  filtrarConversas,
  contadores,
  horaMsg,
  separadorDia,
  type Conversa,
  type MsgConversa,
  type FiltroAba,
} from "@/lib/whatsapp/inbox";
import { iniciais } from "@/lib/ui/apresentacao";

const ABAS: { id: FiltroAba; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "nao_lidas", label: "Não lidas" },
  { id: "favoritos", label: "Favoritos" },
];

export function Inbox({ inicial }: { inicial: Conversa[] }) {
  const [conversas, setConversas] = useState<Conversa[]>(inicial);
  const [aba, setAba] = useState<FiltroAba>("todas");
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MsgConversa[]>([]);
  const [contato, setContato] = useState<DadosContato | null>(null);
  const [texto, setTexto] = useState("");
  const [menu, setMenu] = useState(false);
  const [nova, setNova] = useState(false);
  const [novoTel, setNovoTel] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [erroNova, setErroNova] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);

  const cont = contadores(conversas);
  const visiveis = filtrarConversas(conversas, aba, busca);

  const recarregar = useCallback(() => start(async () => setConversas(await listarConversas())), []);

  const abrir = (tel: string) =>
    start(async () => {
      setAtiva(tel);
      setMsgs(await abrirConversa(tel));
      setContato(await dadosContato(tel));
      setConversas(await listarConversas());
    });

  // polling ~15s
  useEffect(() => {
    const id = setInterval(() => {
      start(async () => {
        setConversas(await listarConversas());
        if (ativa) setMsgs(await abrirConversa(ativa));
      });
    }, 15000);
    return () => clearInterval(id);
  }, [ativa]);

  // auto-scroll ao fim quando a thread muda
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, ativa]);

  const enviar = () =>
    start(async () => {
      if (!ativa || !texto.trim()) return;
      const r = await responder(ativa, texto);
      if (!r.erro) {
        setTexto("");
        setMsgs(await abrirConversa(ativa));
      }
    });

  const toggleFavorita = (c: Conversa) =>
    start(async () => {
      const novoValor = !c.favorita;
      setConversas((cs) => cs.map((x) => (x.telefone === c.telefone ? { ...x, favorita: novoValor } : x)));
      const r = await favoritarConversa(c.telefone, novoValor);
      if (r.erro) setConversas((cs) => cs.map((x) => (x.telefone === c.telefone ? { ...x, favorita: !novoValor } : x)));
    });

  const marcarLidas = () =>
    start(async () => {
      setMenu(false);
      await marcarTodasLidas();
      setConversas(await listarConversas());
    });

  const iniciar = () =>
    start(async () => {
      setErroNova(null);
      const r = await iniciarConversa(novoTel, novoTexto);
      if (r.erro) {
        setErroNova(r.erro);
        return;
      }
      setNova(false);
      setNovoTel("");
      setNovoTexto("");
      setConversas(await listarConversas());
    });

  const hoje = new Date().toISOString();

  return (
    <div className="grid h-full grid-cols-1 bg-creme lg:grid-cols-[20rem_1fr_18rem]">
      {/* Coluna 1 — Conversas */}
      <aside className="flex min-h-0 flex-col border-r border-linha bg-white">
        <div className="flex items-center justify-between p-4 pb-2">
          <h1 className="font-display text-xl font-bold tracking-tight text-texto">Atendimento</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Nova conversa"
              onClick={() => setNova((v) => !v)}
              className="rounded-lg p-1.5 text-cinza hover:bg-creme"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="Mais ações"
                onClick={() => setMenu((v) => !v)}
                className="rounded-lg p-1.5 text-cinza hover:bg-creme"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-linha bg-white py-1 text-sm shadow-lg">
                  <button onClick={marcarLidas} className="block w-full px-3 py-2 text-left hover:bg-creme">
                    Marcar todas como lidas
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {nova && (
          <div className="mx-4 mb-2 space-y-2 rounded-lg border border-linha bg-creme p-3 text-sm">
            <input
              value={novoTel}
              onChange={(e) => setNovoTel(e.target.value)}
              placeholder="Telefone com DDD"
              className="w-full rounded-lg border border-linha bg-white px-3 py-2 focus:border-verde"
            />
            <input
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              placeholder="Mensagem"
              className="w-full rounded-lg border border-linha bg-white px-3 py-2 focus:border-verde"
            />
            {erroNova && <p className="text-xs text-negativo">{erroNova}</p>}
            <div className="flex gap-2">
              <button
                onClick={iniciar}
                disabled={pend || !novoTel.trim() || !novoTexto.trim()}
                className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
              >
                Iniciar
              </button>
              <button onClick={() => setNova(false)} className="rounded-lg border border-linha px-3 py-1.5">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pb-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa ou telefone"
            className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm focus:border-verde"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 text-sm">
          {ABAS.map((a) => {
            const n = a.id === "nao_lidas" ? cont.nao_lidas : a.id === "favoritos" ? cont.favoritos : cont.todas;
            const ativo = aba === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`shrink-0 rounded-full px-3 py-1 font-medium ${
                  ativo ? "bg-verde/15 text-verde" : "border border-linha text-cinza hover:bg-creme"
                }`}
              >
                {a.label}
                {n > 0 && <span className="ml-1 text-xs opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visiveis.map((c) => (
            <div
              key={c.telefone}
              className={`flex cursor-pointer items-center gap-3 border-b border-linha/60 px-4 py-3 ${
                ativa === c.telefone ? "bg-creme" : "hover:bg-creme/60"
              }`}
              onClick={() => abrir(c.telefone)}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde/10 text-sm font-semibold text-verde">
                {iniciais(c.cliente ?? c.telefone)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-texto">{c.cliente ?? c.telefone}</span>
                  <span className="shrink-0 font-mono text-[11px] text-cinza-claro">{horaMsg(c.ultima_em)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-cinza-claro">{c.ultima}</span>
                  {c.nao_lidas > 0 && (
                    <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-verde px-1 text-[11px] font-semibold text-white">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label={c.favorita ? "Desfavoritar" : "Favoritar"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorita(c);
                }}
                className={`shrink-0 ${c.favorita ? "text-verde" : "text-cinza-claro hover:text-cinza"}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={c.favorita ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z" />
                </svg>
              </button>
            </div>
          ))}
          {visiveis.length === 0 && <p className="px-4 py-6 text-sm text-cinza-claro">Nenhuma conversa.</p>}
        </div>
      </aside>

      {/* Coluna 2 — Thread */}
      <section className="flex min-h-0 flex-col">
        {ativa ? (
          <>
            <div className="flex items-center gap-3 border-b border-linha bg-white px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-verde/10 text-xs font-semibold text-verde">
                {iniciais(contato?.razaoSocial ?? ativa)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{contato?.razaoSocial ?? ativa}</p>
                <p className="font-mono text-[11px] text-cinza-claro">{ativa}</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {msgs.map((m, i) => {
                const anterior = msgs[i - 1];
                const dia = separadorDia(m.criado_em, hoje);
                const mostraDia = !anterior || separadorDia(anterior.criado_em, hoje) !== dia;
                return (
                  <div key={i}>
                    {mostraDia && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full border border-linha bg-white px-3 py-0.5 font-mono text-[11px] text-cinza">
                          {dia}
                        </span>
                      </div>
                    )}
                    <div
                      className={`mb-1.5 max-w-[62%] rounded-2xl px-3 py-2 text-sm ${
                        m.direcao === "OUT"
                          ? "ml-auto rounded-br-md bg-verde/15 text-texto"
                          : "rounded-bl-md border border-linha bg-white text-texto"
                      }`}
                    >
                      {m.texto}
                      <span className="mt-0.5 block text-right font-mono text-[10px] text-cinza-claro">
                        {horaMsg(m.criado_em)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>
            <div className="flex gap-2 border-t border-linha bg-white px-4 py-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviar();
                }}
                placeholder="Responder…"
                className="flex-1 rounded-xl border border-linha bg-creme px-4 py-2.5 text-sm focus:border-verde"
              />
              <button
                onClick={enviar}
                disabled={pend}
                className="rounded-xl bg-verde px-5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
              >
                Enviar
              </button>
            </div>
          </>
        ) : (
          <p className="m-auto text-sm text-cinza-claro">Selecione uma conversa.</p>
        )}
      </section>

      {/* Coluna 3 — Painel do contato */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-linha bg-white lg:block">
        {ativa ? (
          contato?.clienteId ? (
            <div>
              <div className="flex flex-col items-center border-b border-linha px-5 py-6 text-center">
                <span className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-verde/10 text-xl font-semibold text-verde">
                  {iniciais(contato.razaoSocial ?? "")}
                </span>
                <p className="font-display text-sm font-semibold text-texto">{contato.razaoSocial}</p>
                <p className="mt-0.5 font-mono text-xs text-cinza-claro">{contato.telefone}</p>
                {contato.regime && (
                  <span className="mt-2 rounded-full bg-verde/10 px-3 py-1 text-xs font-medium text-verde">
                    Cliente · {contato.regime}
                  </span>
                )}
              </div>
              <dl className="text-sm">
                <Linha rotulo="CNPJ/CPF" valor={contato.cnpjCpf} mono />
                {contato.honorario != null && (
                  <Linha rotulo="Honorário" valor={`R$ ${contato.honorario.toFixed(2).replace(".", ",")}`} mono />
                )}
                <Linha rotulo="Situação" valor={contato.situacao === "ativo" ? "Ativo" : "Inativo"} />
              </dl>
              <div className="p-5">
                <Link
                  href={`/clientes/${contato.clienteId}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-verde px-4 py-2.5 text-sm font-medium text-white"
                >
                  Abrir ficha do cliente
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="font-mono text-xs text-cinza-claro">{ativa}</p>
              <p className="text-sm text-cinza">Contato fora da base.</p>
              <Link
                href="/clientes/novo"
                className="rounded-xl border border-linha px-4 py-2 text-sm font-medium text-texto hover:bg-creme"
              >
                Cadastrar cliente
              </Link>
            </div>
          )
        ) : (
          <p className="m-auto px-5 py-10 text-center text-sm text-cinza-claro">Nenhum contato selecionado.</p>
        )}
      </aside>
    </div>
  );
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-linha/60 px-5 py-2.5">
      <dt className="text-cinza-claro">{rotulo}</dt>
      <dd className={`text-right font-medium text-texto ${mono ? "font-mono text-[13px]" : ""}`}>{valor ?? "—"}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Deixar a página full-bleed**

Substituir `src/app/(app)/atendimento/page.tsx` por:

```tsx
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { Inbox } from "./Inbox";
import { listarConversas } from "./actions";

export default async function AtendimentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtender(perfil.papel)) redirect("/");
  const conversas = await listarConversas();
  // Cancela o padding do <main> e preenche a viewport. Offset do topo mobile ajustado no dev-server.
  return (
    <div className="-m-4 h-[calc(100dvh-3.5rem)] md:-m-6 md:h-screen">
      <Inbox inicial={conversas} />
    </div>
  );
}
```

- [ ] **Step 5: Rodar o smoke e ver passar**

Run: `npm test -- inbox-render`
Expected: PASS.

- [ ] **Step 6: Suite completa + lint + typecheck + build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: tudo verde; rota `/atendimento` compila.

- [ ] **Step 7: Verificação visual no dev-server**

Run: `npm run dev` (parar com Ctrl+C depois). Abrir `http://localhost:3000/atendimento`:
- A tela ocupa a página inteira (3 colunas no desktop).
- Abas Todas/Não lidas/Favoritos filtram; a estrela favorita; "nova conversa" e "..." aparecem.
- Abrir a conversa do número de teste mostra separador de dia + horários; painel à direita mostra o contato (ou "fora da base").
- Ajustar os offsets de altura (`3.5rem`/`h-screen`) se sobrar/faltar espaço no topo.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/atendimento/Inbox.tsx" "src/app/(app)/atendimento/page.tsx" src/tests/atendimento/inbox-render.test.tsx
git commit -m "feat(atendimento): tela full-page 3 colunas — chat, abas, favoritar, nova conversa, painel do contato

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CHANGELOG + finalizar branch

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Registrar no CHANGELOG**

Adicionar sob `## [Não lançado]` → `### Adicionado`:

```markdown
- **Atendimento — nova tela (Fatia A):** página inteira em 3 colunas (conversas · thread · contato),
  chat estilo WhatsApp (separador por dia + horário), lista com busca, abas Todas/Não lidas/Favoritos,
  favoritar conversa, nova conversa e menu "marcar todas como lidas"; painel do contato com o cliente
  casado pelo telefone (regime, CNPJ, honorário, situação) e atalho para a ficha.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog do Atendimento Fatia A

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finalizar a branch**

Usar a skill `superpowers:finishing-a-development-branch` para verificar testes e escolher merge/deploy.

---

## Self-Review

- **Cobertura do spec:** tabela `conversa`+RLS (T1) ✓; helpers puros+favoritos (T2) ✓; actions listar/favoritar/marcar-lidas/dados-contato/iniciar (T3) ✓; layout full-page + 3 colunas + abas + favoritar + nova conversa + menu + separador dia + horário + painel contato (T4) ✓; testes unit/smoke (T2/T4) ✓; CHANGELOG (T5) ✓. RLS test dedicado do `conversa` foi coberto por verificação de policy no T1 (o padrão `auth_papel()` já é testado para `whatsapp_mensagem`); não há assert SQL novo em `db:test` — decisão consciente para não inflar o escopo.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `Conversa.favorita`, `FiltroAba`, `DadosContato` (campos `clienteId/razaoSocial/regime/cnpjCpf/honorario/situacao`) usados igualmente em T2/T3/T4; `honorario_mensal`/`cpf_cnpj`/`regime_tributario`/`status` conferem com o schema; `iniciais` existe em `apresentacao.ts`.
