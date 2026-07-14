# Comunicados em massa segmentados (RF-055) — Plano de implementação

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.

**Objetivo:** disparar avisos (legislação, prazos) para um **segmento** da base — por regime, tipo,
status, município/UF, contador ou responsável de departamento — por e-mail (padrão) ou WhatsApp (com
travas), com prévia obrigatória e registro de quem recebeu.

**Arquitetura:** a **regra de segmentação é pura e testada** (`src/lib/comunicados/segmento.ts`); a query e
o envio ficam nas actions. Registro por destinatário com **índice único** `(comunicado_id, cliente_id)` —
ninguém recebe duas vezes.

**Stack:** Supabase/RLS, Next 16 Server Actions, motor de e-mail (RF-051), Z-API, vitest.

## Restrições globais

- **Nunca disparar sem prévia.** A tela mostra contagem, lista e **excluídos com motivo** antes de enviar.
- **WhatsApp: teto de 50 destinatários** por comunicado + aviso de risco de banimento na tela. E-mail sem teto.
- `comunicado_destinatario` **sem policy de INSERT** — só o servidor grava, depois de enviar.
- Opt-out: `clientes.aceita_comunicados` (finalidade distinta da cobrança — LGPD).
- Escrita (criar/disparar): **admin e assistente**.
- Idempotência é do banco (índice único), não do código.
- Rodar `npm run lint && npm run typecheck && npm test && npm run build` antes de cada commit.

---

### Tarefa 1: Banco

**Arquivos:** Criar `supabase/migrations/0093_comunicados.sql`

- [ ] **Passo 1: Escrever**

```sql
-- RF-055: comunicados em massa segmentados (avisos de legislação e prazos).
do $$ begin create type comunicado_canal as enum ('email','whatsapp');
exception when duplicate_object then null; end $$;
do $$ begin create type comunicado_status as enum ('rascunho','enviando','enviado');
exception when duplicate_object then null; end $$;
do $$ begin create type comunicado_envio_status as enum ('ENVIADO','ERRO');
exception when duplicate_object then null; end $$;

create table if not exists comunicado (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,        -- nome interno; não vai ao cliente
  assunto text not null,
  corpo text not null,         -- com variáveis {nome}, {escritorio}, {hoje}...
  canal comunicado_canal not null default 'email',
  filtro jsonb not null default '{}'::jsonb,
  status comunicado_status not null default 'rascunho',
  criado_por uuid references usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create table if not exists comunicado_destinatario (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references comunicado(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  para text not null,
  status comunicado_envio_status not null,
  erro text,
  criado_em timestamptz not null default now()
);
-- Idempotência: o mesmo cliente não recebe o mesmo comunicado duas vezes — nem com
-- clique duplo, nem no "reenviar falhas".
create unique index if not exists uq_comunicado_cliente
  on comunicado_destinatario(comunicado_id, cliente_id) where cliente_id is not null;

-- Opt-out de comunicados: finalidade DISTINTA da cobrança (LGPD). Fica em `clientes`
-- (não em clientes_financeiro): não é dado financeiro e toda linha de cliente existe.
alter table clientes add column if not exists aceita_comunicados boolean not null default true;

alter table comunicado enable row level security;
alter table comunicado_destinatario enable row level security;

do $$ begin
  drop policy if exists comunicado_sel on comunicado;
  create policy comunicado_sel on comunicado for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
  drop policy if exists comunicado_write on comunicado;
  create policy comunicado_write on comunicado for all to authenticated
    using (auth_papel() in ('admin','assistente')) with check (auth_papel() in ('admin','assistente'));

  -- Sem policy de INSERT/UPDATE: só o servidor (service_role) grava, depois de enviar.
  drop policy if exists comunicado_dest_sel on comunicado_destinatario;
  create policy comunicado_dest_sel on comunicado_destinatario for select to authenticated
    using (auth_papel() in ('admin','assistente','contador','financeiro'));
end $$;
```

- [ ] **Passo 2:** `npm run db:migrate` → `0093` aplicada.
- [ ] **Passo 3: Asserts de RLS** em `supabase/tests/rls.test.sql`:
  - assistente **cria** comunicado; **contador** e **financeiro** não (`insufficient_privilege`);
  - **ninguém** (nem admin) faz INSERT em `comunicado_destinatario` pela app — não há policy;
  - cliente do portal (…005) **não vê** `comunicado` nem `comunicado_destinatario` (0 linhas).
  Rodar `npm run db:test`.
- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/0093_comunicados.sql supabase/tests/rls.test.sql
git commit -m "feat(comunicados): tabelas, opt-out e RLS"
```

---

### Tarefa 2: Segmentação — regra pura + testes

**Arquivos:**
- Criar: `src/lib/comunicados/segmento.ts`, `src/tests/comunicados/segmento.test.ts`

**Interfaces produzidas:**

```ts
export type Filtro = {
  regimes?: string[];        // OU interno
  tipos?: string[];          // PJ | PF | MEI
  status?: string[];         // ativo | em_constituicao | inativo
  uf?: string | null;
  cidade?: string | null;
  contadorId?: string | null;
  departamento?: string | null;   // usado com responsavelId
  responsavelId?: string | null;
};

export type ClienteAlvo = {
  id: string; razaoSocial: string; email: string | null; telefone: string | null;
  cpfCnpj: string | null; regime: string | null; tipo: string; status: string;
  cidade: string | null; uf: string | null; contadorId: string | null;
  aceitaComunicados: boolean;
};

export type Excluido = { cliente: ClienteAlvo; motivo: string };

export function aplicarFiltro(clientes: ClienteAlvo[], f: Filtro): ClienteAlvo[];
export function descreverFiltro(f: Filtro): string;   // "Simples ou MEI · Goiânia/GO"
export function elegiveis(
  clientes: ClienteAlvo[], canal: "email" | "whatsapp",
): { destinatarios: ClienteAlvo[]; excluidos: Excluido[] };
export const TETO_WHATSAPP = 50;
```

- [ ] **Passo 1: Testes primeiro**

```ts
import { describe, it, expect } from "vitest";
import { aplicarFiltro, descreverFiltro, elegiveis, type ClienteAlvo } from "@/lib/comunicados/segmento";

const cli = (over: Partial<ClienteAlvo>): ClienteAlvo => ({
  id: "1", razaoSocial: "Cliente", email: "c@x.com", telefone: "62999998888",
  cpfCnpj: "1", regime: "Simples", tipo: "PJ", status: "ativo",
  cidade: "Goiânia", uf: "GO", contadorId: null, aceitaComunicados: true, ...over,
});

describe("aplicarFiltro", () => {
  it("OU dentro do critério: Simples ou MEI", () => {
    const base = [cli({ id: "a", regime: "Simples" }), cli({ id: "b", regime: "MEI" }), cli({ id: "c", regime: "Real" })];
    expect(aplicarFiltro(base, { regimes: ["Simples", "MEI"] }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("E entre critérios: Simples E de Goiânia", () => {
    const base = [
      cli({ id: "a", regime: "Simples", cidade: "Goiânia" }),
      cli({ id: "b", regime: "Simples", cidade: "Anápolis" }),
    ];
    expect(aplicarFiltro(base, { regimes: ["Simples"], cidade: "Goiânia" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("cidade compara sem acento e sem caixa (o cadastro é digitado à mão)", () => {
    const base = [cli({ id: "a", cidade: "GOIANIA" })];
    expect(aplicarFiltro(base, { cidade: "Goiânia" })).toHaveLength(1);
  });

  it("cliente sem endereço não quebra o filtro de cidade — só não entra", () => {
    const base = [cli({ id: "a", cidade: null, uf: null })];
    expect(aplicarFiltro(base, { cidade: "Goiânia" })).toHaveLength(0);
  });

  it("filtro vazio devolve todos", () => {
    const base = [cli({ id: "a" }), cli({ id: "b" })];
    expect(aplicarFiltro(base, {})).toHaveLength(2);
  });
});

describe("elegiveis", () => {
  it("exclui quem não tem e-mail e quem optou por não receber, com o motivo", () => {
    const base = [
      cli({ id: "a" }),
      cli({ id: "b", email: null }),
      cli({ id: "c", aceitaComunicados: false }),
    ];
    const r = elegiveis(base, "email");
    expect(r.destinatarios.map((c) => c.id)).toEqual(["a"]);
    expect(r.excluidos.map((e) => [e.cliente.id, e.motivo])).toEqual([
      ["b", "Sem e-mail cadastrado"],
      ["c", "Não aceita comunicados"],
    ]);
  });

  it("no WhatsApp, exclui quem não tem telefone", () => {
    const r = elegiveis([cli({ id: "a", telefone: null })], "whatsapp");
    expect(r.destinatarios).toHaveLength(0);
    expect(r.excluidos[0]?.motivo).toBe("Sem telefone cadastrado");
  });
});

describe("descreverFiltro", () => {
  it("descreve o segmento em português — é o que o operador lê antes de disparar", () => {
    expect(descreverFiltro({ regimes: ["Simples", "MEI"], cidade: "Goiânia", uf: "GO" })).toBe(
      "Simples ou MEI · Goiânia/GO",
    );
    expect(descreverFiltro({})).toBe("Toda a base");
  });
});
```

- [ ] **Passo 2:** `npm test -- segmento` → FAIL.
- [ ] **Passo 3: Implementar.** Normalizar cidade com
  `s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()` — o cadastro é digitado à mão e
  "GOIANIA" tem de casar com "Goiânia".
- [ ] **Passo 4:** `npm test -- segmento` → PASS.
- [ ] **Passo 5: Commit**

```bash
git add src/lib/comunicados src/tests/comunicados
git commit -m "feat(comunicados): regra pura de segmentacao e elegibilidade"
```

---

### Tarefa 3: Actions — prévia, teste e disparo

**Arquivos:** Criar `src/app/(app)/comunicados/actions.ts`

**Interfaces consumidas:** `aplicarFiltro`, `elegiveis`, `TETO_WHATSAPP` (T2); `enviarEmail` (RF-051);
`enviarTexto` + `carregarConfigZapi` (WhatsApp); `aplicarEmail`/`variaveisDoCliente` (RF-051).

Gate: `podeGerenciarTemplatesEmail(papel)` já é admin/assistente — **reusar**, não criar outra permissão.

- [ ] **Passo 1: `carregarAlvos(filtro)`** — uma query em `clientes` (com o supabase **do usuário**: a RLS
  confirma o escopo), trazendo `id, razao_social, email, telefone, cpf_cnpj, regime_tributario, tipo_pessoa,
  status, endereco, contador_id, aceita_comunicados`, e **excluindo os apagados** (`excluido_em is null`).
  Filtrar por `responsavelId`+`departamento` exige juntar `cliente_responsavel` — fazer uma segunda query
  pelos ids e interseccionar. Mapear para `ClienteAlvo` (cidade/uf saem do jsonb `endereco`) e aplicar
  `aplicarFiltro` **em memória** (a base é de centenas, não de milhões — e assim a regra testada é a mesma
  que roda).

- [ ] **Passo 2: `previa(filtro, canal)`** → `{ destinatarios: {id, nome, para}[], excluidos: {nome, motivo}[],
  total, teto?: string }`. No WhatsApp, se `destinatarios.length > TETO_WHATSAPP`, devolver `teto` com a
  mensagem de bloqueio (a tela impede o disparo).

- [ ] **Passo 3: `enviarTeste(input)`** — manda **só para o operador** (e-mail do usuário logado), com as
  variáveis de um cliente fictício. Não grava nada.

- [ ] **Passo 4: `dispararComunicado(input)`** — a ordem importa:
  1. gate + validação (assunto/corpo não vazios);
  2. recarrega o segmento **no servidor** (nunca confiar na lista que veio do navegador — ela pode ter sido
     adulterada, e o alcance de um comunicado é o que está em jogo);
  3. `elegiveis()`; no WhatsApp, **abortar** acima de `TETO_WHATSAPP`;
  4. cria o `comunicado` (status `enviando`);
  5. para cada destinatário: aplica as variáveis (`{nome}`, `{cnpj}`, `{escritorio}`, `{hoje}`), envia e
     **grava o destinatário** com `service_role` (status `ENVIADO`/`ERRO` + erro). Um envio que falhou não
     pode sumir;
  6. status `enviado` + `enviado_em`;
  7. devolve `{ id, enviados, erros }`.

- [ ] **Passo 5: `reenviarFalhas(comunicadoId)`** — reprocessa **só** os `ERRO` daquele comunicado (apaga a
  linha de erro e reinsere o resultado). O índice único garante que quem já recebeu não recebe de novo.

- [ ] **Passo 6: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test
git add "src/app/(app)/comunicados"
git commit -m "feat(comunicados): previa, envio de teste, disparo e reenvio de falhas"
```

---

### Tarefa 4: Telas

**Arquivos:**
- Criar: `src/app/(app)/comunicados/page.tsx`, `novo/page.tsx`, `novo/FormComunicado.tsx`, `[id]/page.tsx`
- Modificar: `src/components/Sidebar.tsx` (item "Comunicados"), `src/components/clientes/OptOutCobranca.tsx`
  (ou uma seção própria na ficha) para o interruptor **"Aceita comunicados"**
- Modificar: `src/app/(app)/clientes/[id]/page.tsx` (passar `aceita_comunicados`)

- [ ] **Passo 1: `/comunicados`** — lista: título, canal, `descreverFiltro()`, status, enviados/erros, data.
- [ ] **Passo 2: `/comunicados/novo`** — três blocos:
  1. **Conteúdo:** título interno, canal (rádio), assunto, corpo, com os **chips de variáveis** (reusar
     `VARIAVEIS` de `@/lib/email/template`);
  2. **Segmento:** os filtros (regimes, tipos, status, UF, cidade, contador, responsável+departamento), com
     o texto de `descreverFiltro()` sempre visível;
  3. **Prévia e disparo:** botão **"Ver quem vai receber"** → contagem + lista + **excluídos com motivo**;
     **"Enviar teste para mim"**; **"Disparar"** com confirmação que **repete o número** de destinatários.
     No WhatsApp, **aviso em destaque**: disparo em massa pode fazer a Meta banir o número do escritório,
     derrubando atendimento e régua de cobrança; teto de 50.
- [ ] **Passo 3: `/comunicados/[id]`** — destinatários com status e erro; botão **"Reenviar falhas"**.
- [ ] **Passo 4: Ficha do cliente** — interruptor **"Aceita comunicados"** junto aos de cobrança.
- [ ] **Passo 5: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "feat(comunicados): telas de lista, composicao com previa e detalhe"
```

---

### Tarefa 5: Documentação, entrega e tag

- [ ] **Passo 1:** `docs/DOCUMENTACAO.md` (nova seção "Comunicados em massa", com o risco do WhatsApp e o
  opt-out) + `CHANGELOG.md`.
- [ ] **Passo 2:** Commit, merge `develop` → `main`, push.
- [ ] **Passo 3: Pedir ao usuário, explicitamente:** implantar e validar — criar um comunicado segmentado
  que caia **num cliente de teste seu**, conferir a **prévia** (contagem, lista e excluídos), o **envio de
  teste**, o **disparo**, o registro em `/comunicados/[id]` e o **"Reenviar falhas"**. Conferir também o
  interruptor "Aceita comunicados" na ficha (desligado → o cliente aparece como **excluído** na prévia).
- [ ] **Passo 4:** Após o "validei, deu certo": tag `v5.27.0`.
