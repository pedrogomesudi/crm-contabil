# Atendimento em tempo real — Design

**O que é:** as mensagens do Atendimento passam a aparecer no **instante** em que chegam, em vez de
esperar o polling. É a primeira das três melhorias funcionais do Atendimento (as outras: arquivos como
no WhatsApp, e leitura de cadastro).

## O problema (medido)

O `Inbox.tsx` não recebe mensagens em tempo real — ele **pergunta ao servidor de tempos em tempos**:

```ts
// Inbox.tsx:92 — lista de conversas: poll a cada 15s
useEffect(() => {
  const id = setInterval(() => { start(async () => setConversas(await listarConversas())); }, 15000);
  return () => clearInterval(id);
}, []);

// Inbox.tsx:102 — thread aberta: poll a cada 4s
useEffect(() => {
  if (!ativa) return;
  const id = setInterval(() => { start(async () => setMsgs(await abrirConversa(ativa))); }, 4000);
  return () => clearInterval(id);
}, [ativa]);
```

Efeito: uma resposta do cliente demora **até 4s** para aparecer na conversa aberta, e **até 15s** na
lista. O WhatsApp Web é instantâneo. Além da latência, o polling de 4s bate no servidor 15×/min por
atendente com uma conversa aberta.

**O que a stack já oferece:** o webhook do Z-API (`api/webhooks/zapi/[secret]/route.ts:71,90`) insere a
mensagem recebida em `whatsapp_mensagem`; o envio faz o mesmo. Há um client de browser
(`lib/supabase/client.ts`, `createBrowserSupabase`). O **Supabase Realtime** escuta inserções na tabela e
avisa o navegador na hora — é o mecanismo natural, e o projeto **ainda não o usa** em lugar nenhum.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Transporte | **Supabase Realtime** (postgres changes via WebSocket) | Nativo da stack; o webhook já insere na tabela; a RLS já existe. |
| Polling | **Mantido, mas lento (30s), como rede de segurança** | Se o WebSocket cair (proxy do EasyPanel derrubando conexão ociosa, aba dormindo), a tela ressincroniza sozinha. É o que o WhatsApp Web faz por baixo. |
| Alcance | **Conversa aberta E lista** | Sem a lista, só se sabe que outro cliente respondeu no polling de 15s. No WhatsApp a lista reage na hora. |
| Segurança | **A assinatura usa o client autenticado do browser** | O Realtime respeita a RLS existente — um contador não recebe, via WebSocket, a mensagem de cliente que não é dele. Zero lógica de permissão duplicada. |

## Arquitetura

### O banco — habilitar o Realtime na tabela

```sql
-- supabase/migrations/0100_realtime_atendimento.sql
-- Adiciona as tabelas do atendimento à publicação do Realtime. Idempotente.
alter publication supabase_realtime add table whatsapp_mensagem;
alter publication supabase_realtime add table conversa;
```

> A publicação `supabase_realtime` existe por padrão no Supabase. O `add table` é o que faz o Postgres
> emitir os eventos de INSERT/UPDATE dessas tabelas pelo WebSocket. **Idempotência:** `add table` erra se a
> tabela já estiver na publicação — o plano envolve cada `add` num bloco `do $$ … exception when
> duplicate_object then null; end $$;` (o padrão de idempotência já usado no projeto, ex. `0096`). Assim a
> migration pode reaplicar sem quebrar.

### O hook — `useRealtimeAtendimento`

Arquivo novo `src/lib/whatsapp/useRealtimeAtendimento.ts` (client). Encapsula toda a assinatura:

- Abre um canal Supabase Realtime com o client **autenticado** do browser.
- Escuta `INSERT` em `whatsapp_mensagem`:
  - se a linha pertence à **conversa aberta** (mesmo telefone canônico), chama um callback que acrescenta a
    mensagem à thread;
  - sempre chama um callback que sinaliza "a lista mudou" (para atualizar prévia/contador/ordem).
- Escuta `UPDATE` em `whatsapp_mensagem` (status entregue→lido) para o tick azul aparecer sem polling.
- Reconecta ao voltar de `visibilitychange` (aba que dormiu) e no `SUBSCRIBED`/`CHANNEL_ERROR` do canal.
- Retorna o estado da conexão (`conectado: boolean`) para a UI poder decidir se depende do polling.

Interface (o que o `Inbox` consome):
```ts
useRealtimeAtendimento(opts: {
  telefoneAtivo: string | null;         // conversa aberta (chave canônica) ou null
  onMensagemNaConversa: (row: LinhaMensagem) => void;  // acrescenta à thread aberta
  onListaMudou: () => void;             // sinaliza refetch leve da lista
}): { conectado: boolean };
```

`LinhaMensagem` é a linha crua da tabela. O schema atual **já tem** tudo que a thread precisa (confirmado):
`texto` e `status` (migration `0038`), `direcao` (`0040`), `midia_tipo`/`midia_path`/`midia_nome`/`midia_mime`
(`0043`), `criado_em`. Ou seja, o evento do Realtime entrega o conteúdo essencial da mensagem — nada a
adicionar ao schema além de habilitar a publicação.

> **O que NÃO vem no evento:** o nome do cliente casado pelo telefone e a URL montada da mídia são
> derivados no servidor (nas actions `abrirConversa`/`listarConversas`). O evento traz a linha crua. Para a
> **conversa aberta**, isso basta (texto, direção, hora e o path da mídia já vêm). Para dados derivados de
> uma conversa nova (nome do cliente que ainda não estava na lista), o `onListaMudou` dispara um refetch
> leve da lista — que completa em uma ida ao servidor, não em 15s.

### O `Inbox.tsx` — troca o polling rápido pelo hook

- Remove os dois `setInterval` de 4s e 15s.
- Usa o `useRealtimeAtendimento`: `onMensagemNaConversa` faz `setMsgs((m) => [...m, nova])`;
  `onListaMudou` faz um `listarConversas()` (debounced ~1s, para não refazer a cada mensagem de uma rajada).
- Mantém **um** `setInterval` de **30s** como backup: refetch da lista e (se houver conversa aberta) da
  thread. É a rede de segurança se o WebSocket cair.

### O que NÃO muda

- **O envio** (`responder`, `enviarAnexo`): a mensagem enviada já é inserida na tabela, então também chega
  pelo Realtime — o eco aparece sozinho. (Cuidar de não duplicar: a UI já acrescenta a enviada na hora;
  o evento da própria mensagem é ignorado por id.)
- **O webhook, a RLS, o casamento de cliente, a mídia** — intocados.
- **O visual** — esta fatia é só velocidade.

## Verificação

- **`src/tests/whatsapp/realtime.test.ts`** (novo): a lógica pura do hook — dado um evento de INSERT para o
  telefone ativo, `onMensagemNaConversa` é chamado com a linha; para outro telefone, só `onListaMudou`; um
  evento de mensagem cujo id já está na thread não duplica. (Extrair a decisão para uma função pura testável
  sem WebSocket — o padrão do projeto.)
- **Não-regressão:** os testes de `inbox`/`atendimento` seguem verdes; `lint`, `typecheck`, `build`,
  `format:check` limpos.
- **Migration:** `npm run db:migrate` aplica a `0100`; `npm run db:test` verde.
- **Manual (o teste real):** abrir o Atendimento em **duas abas**, mandar mensagem de uma conversa e ver
  aparecer na outra **na hora**; conferir que o contador da lista acende sem abrir a conversa.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Presença ("online", "digitando…") | Recurso próprio; exige outro canal (presence), não postgres changes. |
| O visual do WhatsApp (balão, fundo, avatar) | Fatia à parte — esta é só velocidade. |
| Arquivos como no WhatsApp | É a **sub-fatia 2** do Atendimento, a próxima. |
| Leitura de cadastro (o `select` sem filtro) | É a **sub-fatia 3**, a última. |

## Riscos

| Risco | Mitigação |
|---|---|
| O WebSocket cair no proxy do EasyPanel e a tela "congelar" | O polling de 30s de backup ressincroniza; o hook reconecta em `visibilitychange` e `CHANNEL_ERROR`. |
| Um contador receber, via Realtime, mensagem de cliente que não é dele | A assinatura usa o client autenticado; o Realtime aplica a RLS `wa_msg_select` existente. Testar com um usuário contador. |
| Mensagem enviada aparecer duplicada (a UI já a mostra + o evento) | Dedup por `id` na thread — o evento de uma mensagem cujo id já existe é ignorado. |
| Rajada de mensagens refazer a lista N vezes | O `onListaMudou` é debounced (~1s). |
| A migration `add table` falhar se a tabela já estiver na publicação | Envolver cada `add` em bloco que ignora `duplicate_object`. |
