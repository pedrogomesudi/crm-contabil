# Atendimento — Fatia A (layout full-page + chat + painel do contato) — Design

**Data:** 2026-07-06
**Marco:** V-atend.1 (primeira fatia do redesign do Atendimento)
**Contexto:** O WhatsApp já está ativo (envio + recepção + inbox funcionando). A tela de Atendimento
atual (`src/app/(app)/atendimento/`) é um "quadradinho" de 2 painéis (`max-w-5xl` + `h-[70vh]`) que
não usa a página e tem pouca informação. Esta fatia reforma o layout e adiciona recursos de lista.

## Objetivo

Transformar o Atendimento numa tela de conversas **de página inteira**, estilo WhatsApp, com:
lista de conversas (busca + abas + favoritar + nova conversa), thread com separadores por dia e
horários, e **painel do contato** à direita mostrando o cliente casado pelo telefone.

Fora de escopo (fatias seguintes): mídia (B), status/atribuição de atendente + ✓✓ de leitura (C),
respostas rápidas (D), grupos de WhatsApp (o usuário não usa).

## Arquitetura

Mantém a arquitetura atual (Server Actions + client component com polling). Mudanças:

1. **Nova tabela `conversa`** — persiste o marcador de favorito por telefone (a conversa em si
   continua derivada das mensagens; a tabela guarda só metadados). Extensível para a Fatia C
   (status/atendente) sem nova migration de base.
2. **Helpers puros** (`src/lib/whatsapp/inbox.ts`) para formatação de data/hora e filtragem —
   testáveis isoladamente.
3. **Actions novas** em `src/app/(app)/atendimento/actions.ts`: favoritar, marcar todas lidas,
   dados do contato, iniciar conversa. `listarConversas` passa a devolver `favorita`.
4. **Reescrita do `Inbox.tsx`** para o layout de 3 colunas full-page.
5. **Layout full-bleed** — a página de atendimento cancela o padding do `<main>` e ocupa a altura
   da viewport.

## Dados

### Tabela `conversa` (nova migration)

```sql
create table if not exists conversa (
  telefone   text primary key,
  favorita   boolean not null default false,
  criado_em  timestamptz not null default now()
);
alter table conversa enable row level security;
-- Mesma condição de escrita de whatsapp_mensagem (0038): quem atende = admin/financeiro/contador.
-- Favorito é metadado global por telefone (não vinculado a cliente_id), então a condição é por papel.
drop policy if exists conversa_all on conversa;
create policy conversa_all on conversa for all to authenticated
  using (auth_papel() in ('admin','financeiro','contador'))
  with check (auth_papel() in ('admin','financeiro','contador'));
```

### Tipo `Conversa` (estender)

```ts
export type Conversa = {
  telefone: string; cliente: string | null; ultima: string; ultima_em: string;
  nao_lidas: number; favorita: boolean;   // <- novo
};
```

`agruparConversas` recebe um segundo parâmetro opcional `favoritos: Set<string>` e marca
`favorita: favoritos.has(telefone)` (default `false`).

### Tipo `DadosContato` (novo)

```ts
export type DadosContato = {
  telefone: string;
  clienteId: string | null;
  razaoSocial: string | null;
  regime: string | null;       // p/ badge
  cnpjCpf: string | null;
  honorario: number | null;    // clientes_financeiro.valor, se visível
  situacao: string | null;     // ativo/inativo
};
```

## Helpers puros (TDD) — `src/lib/whatsapp/inbox.ts`

```ts
// "hoje" / "ontem" / "dd/mm/aaaa" comparando as DATAS locais (não UTC).
export function separadorDia(iso: string, hojeIso: string): string

// "HH:MM" 24h da data local.
export function horaMsg(iso: string): string

// Filtra e ordena conversas por aba + busca (nome do cliente OU telefone, case-insensitive).
export type FiltroAba = "todas" | "nao_lidas" | "favoritos";
export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[]

// Contadores para os badges das abas.
export function contadores(convs: Conversa[]): { todas: number; nao_lidas: number; favoritos: number }
```

Regras:
- `separadorDia`/`horaMsg`: usar componentes de data **locais** (`getFullYear/Month/Date`,
  `getHours/Minutes`), zero-pad. "ontem" = data local exatamente 1 dia antes de `hojeIso`.
- `filtrarConversas`: `nao_lidas` → `nao_lidas > 0`; `favoritos` → `favorita`; busca compara
  `cliente ?? ""` e `telefone` com `includes` do termo normalizado (minúsculas, sem espaços).
  Mantém a ordem já vinda de `agruparConversas` (mais recente primeiro).
- `contadores.nao_lidas` = nº de **conversas** com `nao_lidas > 0` (não soma de mensagens),
  batendo com o print de referência ("Não lidas 2").

## Actions — `src/app/(app)/atendimento/actions.ts`

Todas atrás do `gate()` existente (`podeAtender`).

- `listarConversas()` — além do que já faz, busca `select telefone from conversa where favorita`
  e passa o `Set` para `agruparConversas`. (Uma query extra, barata.)
- `favoritarConversa(telefone: string, favorita: boolean): Promise<{ ok?: boolean; erro?: string }>`
  — `upsert` em `conversa` (`onConflict: telefone`) com `favorita`. Usa o cliente do usuário
  (RLS). `revalidatePath` não é necessário (a UI atualiza local + repoll).
- `marcarTodasLidas(): Promise<{ ok?: boolean }>` — `update whatsapp_mensagem set lida=true where
  direcao='IN' and lida=false` (RLS limita ao visível).
- `dadosContato(telefone: string): Promise<DadosContato>` — resolve o cliente casado pelo telefone
  (mesma lógica de `responder`: normaliza `clientes.telefone` e casa se **exatamente um**). Se
  casar, busca razão social, regime, documento, situação e honorário
  (`clientes_financeiro.valor`, só se o papel puder ver — reutilizar `podeVerHonorario`; senão
  `honorario: null`). Sem cliente → todos `null` exceto `telefone`.
- `iniciarConversa(telefone: string, texto: string)` — normaliza o telefone digitado
  (`normalizarTelefone`), valida (11–13 dígitos após limpeza; senão erro "Telefone inválido"),
  e delega para `responder(telefoneNormalizado, texto)`. Assim a "nova conversa" reaproveita todo
  o caminho de envio + persistência.

## UI — `Inbox.tsx` (reescrita)

Client component. Layout de 3 colunas ocupando a viewport:

```
[ conversas 320px ] [ thread flex ] [ contato 300px ]
```

### Coluna 1 — Conversas
- Cabeçalho: título "Atendimento" + botão **nova conversa** (ícone lápis) + menu "..." (só a ação
  "Marcar todas como lidas" nesta fatia).
- Busca (input controlado) filtra via `filtrarConversas`.
- **Abas** (chips): `Todas` · `Não lidas N` · `Favoritos` — estado `aba`, contadores via
  `contadores`. Chip ativo em verde (token `--verde`/`bg-verde/10 text-verde`).
- Lista: cada item com iniciais (`iniciais(cliente ?? telefone)`), nome (`cliente ?? telefone
  formatado`), prévia (`ultima`), horário (`horaMsg(ultima_em)` — se hoje; senão dia curto),
  badge de não-lidas, e uma **estrela** (favoritar) que chama `favoritarConversa` e alterna local.
- Clicar abre a conversa (mantém `abrirConversa`, que marca lidas).

### Coluna 2 — Thread
- Cabeçalho: iniciais + nome + telefone.
- Mensagens: agrupadas com **separador por dia** (`separadorDia` — inserir um chip quando a data
  muda entre mensagens consecutivas). Balões: `OUT` à direita (fundo `bubble-out`/verde-claro),
  `IN` à esquerda (branco/borda). Cada balão com **horário** (`horaMsg`). Auto-scroll ao fim ao
  abrir/nova mensagem.
- Composer fixo embaixo: input + "Enviar" (mantém `responder`). Enter envia.
- Sem conversa selecionada: estado vazio ("Selecione uma conversa").

### Coluna 3 — Painel do contato
- Carrega `dadosContato(telefone)` quando uma conversa abre.
- Cliente casado: iniciais grandes, razão social, telefone, badge do regime, linhas de dados
  (CNPJ/CPF, honorário se visível, situação), e **um** botão **"Abrir ficha do cliente"**
  (`/clientes/{clienteId}`). O botão "Cobrar via WhatsApp" fica FORA desta fatia (não há ação
  pronta a plugar aqui) — não incluir.
- Número não casado: mostra telefone + aviso "Contato fora da base" + botão "Cadastrar cliente"
  que linka para `/clientes/novo` (link simples, sem prefill).
- Responsivo: `< 1100px` esconde a coluna do contato; `< 820px` vira uma coluna (lista → thread).

### Layout full-bleed
A página `page.tsx` envolve o `Inbox` num container que cancela o padding do `<main>` e preenche a
altura: `-m-4 md:-m-6` + `h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)]`. Cada coluna rola
internamente (`overflow-y-auto`); o body nunca rola horizontalmente. Ajustar os offsets exatos no
dev-server (o mobile tem a barra superior do Sidebar).

## Polling / atualização
Mantém o polling atual do `Inbox` (re-`listarConversas`/`abrirConversa` a cada N s + botão
"atualizar"). Favoritar e marcar-lidas atualizam o estado local imediatamente e são confirmados no
próximo poll.

## Tratamento de erros
- Actions retornam `{ erro }` legível; a UI mostra inline (toast/linha vermelha), sem quebrar.
- `iniciarConversa` com telefone inválido → erro claro, não envia.
- `favoritarConversa`/`marcarTodasLidas` falham silenciosamente para o fluxo (log no console),
  UI reverte o estado otimista se retornar erro.

## Testes
- **Unit (Vitest):** `separadorDia`, `horaMsg`, `filtrarConversas`, `contadores`, e
  `agruparConversas` com favoritos. Casos: hoje/ontem/data; 24h zero-pad; busca por nome e por
  telefone; aba não-lidas/favoritos; contadores por conversa.
- **RLS (db:test):** `conversa` — usuário que atende lê/escreve; papel sem atendimento é barrado.
- **Smoke (renderToStaticMarkup):** `Inbox` renderiza com lista mockada sem lançar.

## Migrations
Uma migration nova: `NNNN_conversa.sql` (tabela + RLS). Idempotente (`create table if not exists`,
`drop policy if exists`). Sem `ALTER TYPE`. Aplicada por `npm run db:migrate` (atinge produção).
