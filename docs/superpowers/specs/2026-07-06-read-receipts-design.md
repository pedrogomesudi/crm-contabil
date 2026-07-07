# Atendimento — Read receipts (✓ / ✓✓ / ✓✓ verde) — Design

**Data:** 2026-07-06
**Marco:** parte da Fatia C do Atendimento (recibos de entrega/leitura).
**Contexto:** O Atendimento (Fatia A) já está no ar. As mensagens enviadas (`whatsapp_mensagem`
`direcao='OUT'`) hoje só têm `status ENVIADO/ERRO`. Queremos mostrar, em cada mensagem enviada:
`✓` (enviado) → `✓✓` cinza (entregue) → `✓✓` verde (lido), e `!` para erro.

## Objetivo

Rastrear o ciclo de vida de cada mensagem enviada pelo CRM usando os eventos de status do Z-API,
e refletir isso na UI da thread com os checks estilo WhatsApp.

## Arquitetura

Três peças ligadas pelo `messageId` que o Z-API atribui a cada envio:

1. **Captura no envio:** `responder`/`iniciarConversa` guardam o `messageId` retornado pelo Z-API na
   coluna `z_message_id` da mensagem OUT.
2. **Webhook de status:** o Z-API envia eventos de status (SENT/RECEIVED/READ/PLAYED) para um webhook.
   O handler existente (`/api/webhooks/zapi/[secret]`) passa a distinguir mensagem-recebida × evento-de-
   status e, no segundo caso, atualiza o `status` da(s) mensagem(ns) OUT correspondente(s) por
   `z_message_id`.
3. **UI:** a thread renderiza o check conforme o `status` da mensagem OUT.

Fora de escopo: status de leitura das mensagens RECEBIDAS (não faz sentido); mídia; atribuição de
atendente (Fatia C restante).

## Dados

### Enum `whatsapp_status` — adicionar valores

```sql
alter type whatsapp_status add value if not exists 'ENTREGUE';
alter type whatsapp_status add value if not exists 'LIDO';
```

Migration **só de enum** (os novos valores são usados apenas em runtime pela app / UPDATE, nunca na
mesma transação que os adiciona — respeita o gotcha do Postgres). Idempotente.

Ciclo do `status` de uma mensagem `OUT`: `ENVIADO` → `ENTREGUE` → `LIDO` (e `ERRO` se o envio falhou).
`RECEBIDO` continua exclusivo de `IN`. A coluna `z_message_id` e o índice único parcial
`uq_wa_msg_zid` já existem (0040).

### Rank de progressão (para não rebaixar)

Ordem: `ENVIADO(1) < ENTREGUE(2) < LIDO(3)`. Um evento só atualiza se **avança** o estado. Implementado
no UPDATE via cláusula de `status` anterior permitido (ver §Webhook), evitando corrida/ordem invertida.

## Helpers puros — `src/lib/whatsapp/inbox.ts` (TDD)

```ts
// Extrai um evento de status do payload do Z-API. null se não for evento de status.
// Mapeia: SENT→"ENVIADO"; RECEIVED/DELIVERED→"ENTREGUE"; READ/PLAYED→"LIDO".
export type StatusEntrega = "ENVIADO" | "ENTREGUE" | "LIDO";
export function extrairStatusZapi(payload: unknown): { status: StatusEntrega; ids: string[] } | null;

// Ícone de entrega para a UI. Só para OUT; null para IN/sem status.
export type MarcaEntrega = "enviado" | "entregue" | "lido" | "erro";
export function marcaEntrega(status: string, direcao: "IN" | "OUT"): MarcaEntrega | null;
```

Regras de `extrairStatusZapi` (defensivo — Z-API não-oficial):
- Só considera evento de status quando **não** é mensagem de texto/mídia recebida e há um campo de
  status reconhecível. Fontes aceitas do status: `payload.status` (string). Fontes aceitas dos ids:
  `payload.ids` (array de string) **ou** `payload.messageId` (string única) **ou** `payload.id`.
- Normaliza o status para maiúsculas e mapeia:
  - `SENT` → `"ENVIADO"`
  - `RECEIVED`, `DELIVERED`, `DELIVERY_ACK` → `"ENTREGUE"`
  - `READ`, `PLAYED`, `READ_SELF` → `"LIDO"`
  - qualquer outro / ausente → retorna `null`.
- Sem nenhum id válido → `null`.
- `payload.fromMe`/eventos de mensagem recebida: se houver texto/mídia (o que `extrairMensagemZapi`
  já trata), este helper não é chamado (ver ordem no webhook).

Regras de `marcaEntrega`:
- `direcao !== "OUT"` → `null`.
- `ERRO` → `"erro"`; `LIDO` → `"lido"`; `ENTREGUE` → `"entregue"`; `ENVIADO` → `"enviado"`;
  qualquer outro (ex.: `RECEBIDO` num OUT, improvável) → `null`.

## Envio — capturar o `messageId`

Em `src/app/(app)/atendimento/actions.ts`, na `responder`, extrair o id da resposta do Z-API e
gravá-lo na inserção da mensagem OUT:

```ts
const resp = (r.resposta ?? {}) as { messageId?: string; id?: string; zaapId?: string };
const zId = resp.messageId ?? resp.id ?? null;
// ... insert:
z_message_id: r.ok ? zId : null,
```

`iniciarConversa` já delega para `responder`, então herda a captura. Se o Z-API não devolver id
(degradação graciosa): a mensagem fica sem rastreio e exibe apenas `✓` (status `ENVIADO`).

> Nota sobre o índice único `uq_wa_msg_zid`: um `messageId` de OUT nunca colide com o de uma IN (ids
> distintos). Se, por algum motivo, dois envios retornarem o mesmo id (não esperado), a segunda
> inserção violaria o índice — por isso, em erro de `duplicate`, a inserção grava a mensagem **sem**
> `z_message_id` (fallback) para não perder a mensagem. (Tratar no `responder`.)

## Webhook — tratar eventos de status

Em `src/app/api/webhooks/zapi/[secret]/route.ts`, após a autenticação do segredo, a ordem passa a ser:

1. `extrairMensagemZapi(payload)` → se **mensagem recebida**, fluxo atual (insert IN). Fim.
2. Senão, `extrairStatusZapi(payload)` → se **evento de status**, atualizar as mensagens OUT:
   ```ts
   const anteriores =
     ev.status === "ENTREGUE" ? ["ENVIADO"] :
     ev.status === "LIDO"     ? ["ENVIADO", "ENTREGUE"] : [];
   if (anteriores.length) {
     await admin.from("whatsapp_mensagem")
       .update({ status: ev.status })
       .in("z_message_id", ev.ids)
       .eq("direcao", "OUT")
       .in("status", anteriores);
   }
   ```
   (Para `ENVIADO` não há update — já é o estado inicial.) Fim.
3. Senão → `{ ok: true, ignored: true }` (como hoje).

**Instrumentação (para o risco do payload):** logar `console.log("zapi status payload:", JSON.stringify(payload).slice(0,400))` quando cair no caso 3 **e** o payload contiver a chave `status`, para capturar o formato real e calibrar o parser se necessário. (Remover o log após validado.)

## UI — checks na thread

`MsgConversa` (em `inbox.ts`) ganha `status: string`. `mapMsgs` (em `actions.ts`) passa a mapear
`status` (com fallback `m.status ?? ""`). Para o campo nunca vir indefinido, **ambos** os selects que
usam `mapMsgs` — `listarConversas` e `abrirConversa` — incluem `status` na lista de colunas. No
`Inbox.tsx`, no balão OUT, ao lado do horário, renderizar via `marcaEntrega`:

- `"enviado"` → `✓` cor `text-cinza-claro`
- `"entregue"` → `✓✓` cor `text-cinza-claro`
- `"lido"` → `✓✓` cor `text-verde`
- `"erro"` → `!` cor `text-negativo`
- `null` (IN) → nada.

Os checks podem ser caracteres (`✓`, `✓✓`) ou um pequeno SVG; o dobro (`✓✓`) é um único elemento
estilizado. A cor é a única diferença entre entregue e lido.

(A lista de conversas não exibe check nesta fatia, mas `listarConversas` inclui `status` no select
mesmo assim para o `mapMsgs` compartilhado ficar consistente.)

## Fluxo de dados (resumo)

```
Envio:   responder → enviarTexto → Z-API responde {messageId}
                    → insert OUT (status=ENVIADO, z_message_id=messageId)
Status:  Z-API → webhook "Ao atualizar status" → extrairStatusZapi
                    → UPDATE OUT status (avança ENVIADO→ENTREGUE→LIDO) por z_message_id
UI:      abrirConversa (select status) → marcaEntrega(status,'OUT') → ✓ / ✓✓ / ✓✓ verde
```

## Passo operacional (usuário, uma vez)

No painel Z-API, preencher o webhook **"Ao atualizar status"** (on-message-status) com a **mesma URL**
do webhook de recebimento:
`https://app.seusaldo.ai/api/webhooks/zapi/<ZAPI_WEBHOOK_SECRET>`.
O handler distingue os dois tipos de payload pela mesma rota.

## Tratamento de erros
- `messageId` ausente no envio → mensagem sem rastreio, exibe `✓` (não quebra).
- Evento de status para `z_message_id` desconhecido → o UPDATE não afeta linhas (no-op silencioso).
- Evento fora de ordem (LIDO antes de ENTREGUE) → o `in("status", anteriores)` do LIDO inclui
  `ENVIADO`, então avança direto; ENTREGUE atrasado não rebaixa (não casa `status=ENVIADO`). OK.
- Payload de status em formato inesperado → `extrairStatusZapi` retorna `null`, cai no log e é ignorado.

## Testes
- **Unit (Vitest):** `extrairStatusZapi` (SENT/RECEIVED/READ/PLAYED; ids via `ids[]`, `messageId`,
  `id`; payload sem status → null; sem ids → null) e `marcaEntrega` (cada status; IN → null).
- **Migration:** aplicar `npm run db:migrate`; verificar que `ENTREGUE`/`LIDO` existem no enum.
- **Smoke:** `Inbox` renderiza uma mensagem OUT `LIDO` mostrando o check (sem lançar).

## Migrations
Uma migration nova: `0042_status_entrega.sql` (só `alter type ... add value if not exists`). Sem uso
dos novos valores na mesma migration. Aplicada por `npm run db:migrate`.
