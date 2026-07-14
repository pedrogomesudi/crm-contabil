# Régua de cobrança por e-mail (RF-051, Fatia B) — Design

**Data:** 2026-07-14
**Requisito:** RF-051 — o e-mail como **canal redundante da régua de cobrança**.
**Risco que isto mitiga (gap analysis v1.3, Seção de riscos):** *"Dependência de canal não oficial
(Z-API): sujeito a banimento do número pela Meta sem aviso; com a régua operando exclusivamente por
esse canal, um banimento paralisa a cobrança."*

---

## 1. Comportamento: fallback, nunca duplicidade

Para cada título em aberto e cada etapa da régua que "vence" hoje, o motor tenta **WhatsApp primeiro** e
só usa o **e-mail** se o WhatsApp não entregou. O cliente nunca recebe duas cobranças do mesmo título
na mesma etapa.

O e-mail assume quando:
1. o **WhatsApp não está configurado** (hoje isso aborta a régua inteira — passa a não abortar);
2. o cliente **não tem telefone** válido;
3. o cliente **optou por não receber WhatsApp** (`cobranca_whatsapp = false`);
4. o envio pelo Z-API **falhou** (erro do provedor).

E só sai se o cliente **tem e-mail** e **não** desligou o canal (`cobranca_email`), e se o fallback
estiver ligado no escritório (`email_config.regua_email_fallback`, ligado por padrão).

## 2. Mudança de comportamento em produção (atenção)

Hoje `cobranca_whatsapp = false` **pula o título inteiro** — o cliente fica em silêncio total. A partir
desta fatia, esse interruptor passa a significar apenas **"não me cobre por WhatsApp"**, e o e-mail
assume.

**Consequência aceita (decisão do usuário):** um cliente que hoje está em silêncio porque alguém usou
esse interruptor como "não cobrar este cliente" **voltará a ser cobrado**, agora por e-mail. Mitigação:
a nova coluna `cobranca_email` nasce **ligada**, mas a tela de opt-out passa a mostrar os **dois**
interruptores lado a lado, deixando explícito o que cada um faz — e a documentação registra a mudança.

## 3. Dedupe entre canais

`whatsapp_mensagem` já tem `uq_wa_msg_titulo_etapa (titulo_id, etapa_id) where etapa_id is not null`,
que impede reenviar a mesma etapa. O e-mail ganha o equivalente:

- `email_mensagem.etapa_id uuid references regua_etapa(id)`;
- `create unique index uq_email_msg_titulo_etapa on email_mensagem(titulo_id, etapa_id) where etapa_id is not null`.

E, **antes de enviar**, o motor consulta os **dois** canais para aquele `(titulo_id, etapa_id)`. Sem
isso, uma reexecução do cron no mesmo dia cobraria de novo pelo outro canal — o índice único de cada
tabela sozinho não impede a duplicidade *entre* canais.

O índice único também é a trava contra corrida (duas execuções simultâneas do cron): o INSERT que perder
falha e o envio conta como "pulado", exatamente como já acontece no WhatsApp.

## 4. Conteúdo da etapa

`regua_etapa` ganha `email_assunto text` e `email_corpo text`, com as **mesmas variáveis** já usadas no
template do WhatsApp: `{nome}`, `{valor}`, `{vencimento}`, `{dias}`.

**Degradação graciosa:** se a etapa não tiver `email_corpo`, o e-mail usa o **texto do WhatsApp** como
corpo, e o assunto cai para `"Cobrança — {nome}"`. Assim a régua não fica muda por esquecimento de
configuração — que é justamente o cenário em que o fallback importa (banimento inesperado do número).

## 5. Banco — migration `0090_regua_email.sql`

```sql
alter table regua_etapa add column if not exists email_assunto text;
alter table regua_etapa add column if not exists email_corpo text;

alter table clientes_financeiro add column if not exists cobranca_email boolean not null default true;

alter table email_config add column if not exists regua_email_fallback boolean not null default true;

alter table email_mensagem add column if not exists etapa_id uuid references regua_etapa(id) on delete set null;
create unique index if not exists uq_email_msg_titulo_etapa
  on email_mensagem(titulo_id, etapa_id) where etapa_id is not null;
```

Sem novas policies: `email_mensagem` continua **sem policy de INSERT** (só `service_role` grava, que é
como o motor roda), e `regua_etapa` / `clientes_financeiro` mantêm as suas.

## 6. Código

- `src/lib/whatsapp/regua-motor.ts` → renomear conceitualmente para o **motor da régua** (o arquivo
  permanece, para não quebrar imports; o e-mail entra como segundo canal):
  - não abortar mais quando o WhatsApp não está configurado — seguir só com e-mail;
  - por título/etapa: `jaEnviado(tituloId, etapaId)` consultando **os dois** canais;
  - tentar WhatsApp; se não entregou (qualquer um dos 4 motivos), tentar e-mail;
  - `ResumoRegua` ganha `enviadosEmail` e `enviadosWhatsapp` (o total continua em `enviados`), para o
    painel mostrar o que saiu por onde.
- `src/lib/email/regua.ts` (novo, **puro e testável**): `decidirCanal()` — recebe o estado (whatsapp
  configurado?, telefone?, opt-outs, fallback ligado?, e-mail do cliente?) e devolve
  `"whatsapp" | "email" | "nenhum"` + o motivo. É onde mora a regra; o motor só executa.
- `/financeiro/regua-cobranca`: editor da etapa ganha **assunto** e **corpo de e-mail** (com o aviso de
  que, em branco, o e-mail reaproveita o texto do WhatsApp). O histórico passa a mostrar o **canal**.
- Opt-out do cliente: os dois interruptores (WhatsApp / e-mail).

**Testes unitários** (vitest, sem rede) — o valor está aqui, porque a regra é a parte que erra:
`decidirCanal()` em todos os cenários (sem telefone; opt-out de WhatsApp; opt-out dos dois; WhatsApp não
configurado; fallback desligado; sem e-mail; tudo ok → whatsapp), e a degradação do conteúdo (etapa sem
`email_corpo` → usa o texto do WhatsApp).

## 7. Entrega e validação

Migration → lint/typecheck/test/build → deploy. Validar em produção com um cliente de teste:
configurar uma etapa com `dias_offset` que case com um título real, rodar a régua **manualmente**
(o botão já existe no painel), e conferir:
1. cliente **com** telefone → sai por WhatsApp, e o e-mail **não** sai;
2. cliente **sem** telefone (ou com `cobranca_whatsapp = false`) → sai por e-mail;
3. rodar de novo no mesmo dia → **nada** sai (o dedupe entre canais segura);
4. o histórico mostra o canal de cada envio.

**Versão:** `v5.25.0` (feature).
