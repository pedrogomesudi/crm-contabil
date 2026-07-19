# RF-007 — Follow-up automatizado de propostas — Design

**O que é:** uma sequência de mensagens automáticas (e-mail **ou** WhatsApp) disparadas em prazos
configuráveis a partir do envio da proposta, parando no aceite/recusa. Espelha a **régua de cobrança** que
já existe, aplicada ao comercial. Fecha a RF-007. **Três fatias** (dados+config → motor+cron → visibilidade).

## O estado de hoje (medido)

- A **régua de cobrança** já faz exatamente este padrão para faturas: `regua_etapa`
  (`dias_offset`/`template`/`ordem`/`ativa`, migration `0039`), um motor puro, e o cron
  `POST /api/cron/regua-cobranca` (protegido por `CRON_SECRET`, batido por um **agendador externo diário**).
- Os **canais existem:** `lib/email/enviar.ts` (e-mail) e `lib/whatsapp/zapi.ts` (WhatsApp).
- A **proposta** (`0057`) tem `status` (`rascunho`/`enviada`/`aceita`/`recusada`), itens, e o contato vem da
  **oportunidade** (`contato_nome`/`contato_email`/`contato_telefone`). `definirStatusProposta` muda o status.
- **Não há** hoje: sequência de follow-up de proposta, nem `enviada_em` na proposta.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Gatilho | **Começa ao enviar** (`status = 'enviada'`, D+0 = `enviada_em`); **para no aceite/recusa** | Follow-up clássico de proposta; automático. |
| Canal | **Um canal fixo para a sequência toda** (e-mail **ou** WhatsApp) | Simples de configurar; sem duplicar mensagem. |
| Passos | **`followup_etapa`** (dias após envio, template, ordem, ativa) — configurável | Espelha `regua_etapa`. |
| Dedupe | **`followup_envio`** por (`proposta_id`, `etapa_id`) | O cron diário não reenvia. |
| D+0 | **coluna `proposta.enviada_em`**, gravada no envio | Não existe; é a âncora dos prazos. |
| Disparo | **Cron** `POST /api/cron/followup-proposta`, mesmo agendador da régua | Reusa a infra de agendamento. |
| Controle manual | **Não** (sem pausa) — automático; a proposta só mostra | YAGNI; o gatilho escolhido é automático. |

## Arquitetura

### O modelo de dados (Fatia A)

```sql
create table followup_config (
  id boolean primary key default true check (id),  -- singleton
  canal text not null default 'email',             -- 'email' | 'whatsapp'
  ativo boolean not null default false
);
create table followup_etapa (
  id uuid primary key default gen_random_uuid(),
  dias_offset int not null,        -- dias após o envio da proposta (≥ 0)
  assunto text,                    -- usado no canal e-mail
  template text not null,          -- mensagem com variáveis
  ordem int not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create table followup_envio (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id) on delete cascade,
  etapa_id uuid not null references followup_etapa(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  destino text,                    -- e-mail/telefone usado
  status text not null default 'enviado',  -- 'enviado' | 'sem_destino' | 'falhou'
  unique (proposta_id, etapa_id)
);
alter table proposta add column if not exists enviada_em timestamptz;
```

RLS: config/etapa/envio no padrão do comercial (`auth_papel() in ('admin','assistente','contador')`) — a
edição da config fica atrás de gate **admin** na action; o cron roda com service role.
`proposta.enviada_em` é gravada em `definirStatusProposta` quando o status passa a `enviada` (só na 1ª vez —
`coalesce`, para não reiniciar o relógio se reenviada).

### A lógica pura (Fatia B) — `lib/comercial/followup.ts`

```ts
export type EtapaFollowup = { id: string; diasOffset: number; ativa: boolean };
// Quais etapas ativas venceram (enviadaEm + diasOffset ≤ hoje) e ainda não foram enviadas.
export function etapasDevidas(
  enviadaEm: string,
  etapas: EtapaFollowup[],
  jaEnviadas: string[],   // etapa_id já registrados para a proposta
  hoje: string,           // 'YYYY-MM-DD'
): EtapaFollowup[];

export function aplicarVariaveis(template: string, vars: Record<string, string>): string;
```

`etapasDevidas`: para cada etapa ativa não em `jaEnviadas`, calcula a data devida a partir de `enviadaEm`
(UTC → dia) + `diasOffset`; inclui se `≤ hoje`. `aplicarVariaveis` troca `{chave}` pelos valores
(`prospect`, `numero`, `valor`, `validade`).

### O motor + cron (Fatia B)

`processarFollowup(hoje)`:
- Se `!config.ativo`, retorna resumo vazio.
- Carrega as `followup_etapa` ativas; busca propostas `status = 'enviada'` com `enviada_em` preenchido.
- Para cada proposta: `jaEnviadas` = `followup_envio.etapa_id` dessa proposta; `etapasDevidas(...)`; para
  cada etapa devida: monta a mensagem (`aplicarVariaveis`), resolve o **destino** pelo canal
  (`contato_email` ou `contato_telefone` da oportunidade); se vazio → grava `followup_envio` com
  `status='sem_destino'` (não repete); senão envia (`enviar`/`zapi`) e grava `status='enviado'` (ou
  `'falhou'`). Idempotente por `unique(proposta_id, etapa_id)`.
- Retorna `{ enviados, pulados, falhas }`.

Cron `POST /api/cron/followup-proposta` — copia do `regua-cobranca/route.ts` (auth `CRON_SECRET`,
timing-safe), chama `processarFollowup(hoje)`. **Operação:** a URL nova precisa ser adicionada ao agendador
diário externo que já bate na régua (senão nunca dispara).

### A config e a visibilidade

- **Configurações → Follow-up de propostas** (admin): canal + `ativo`; a lista de `followup_etapa` (dias,
  assunto, mensagem, ativa) com adicionar/remover/reordenar; legenda das variáveis. Padrão das telas de
  config (Funil/Precificação).
- **Seção "Follow-up" na proposta** (Fatia C, só leitura): se não enviada, "O follow-up começa quando a
  proposta for enviada"; enviada, a agenda por etapa (data prevista = `enviada_em + dias`) e o status de
  cada uma (enviado em / pendente / sem destino) a partir de `followup_envio`.

## Fatias de implementação

| Fatia | Entrega | Visível? | Migration? |
|---|---|---|---|
| **A — dados + config** | 3 tabelas + `proposta.enviada_em` (gravado no envio) + tela de config | Sim | Sim |
| **B — motor + cron** | `etapasDevidas`/`aplicarVariaveis` (testados) + `processarFollowup` + cron | Não | Não |
| **C — visibilidade** | seção "Follow-up" na proposta (agenda + histórico) | Sim | Não |

Cada fatia tem spec/plano próprios ao chegar nela — **o design é este, único**.

## Verificação

- **Lógica testável:** `etapasDevidas` (vencidas × não vencidas × já enviadas; borda "hoje") e
  `aplicarVariaveis`.
- **Motor:** idempotência por `unique(proposta_id, etapa_id)`; `sem_destino` não repete; para no
  aceite/recusa (consulta só `enviada`).
- **`enviada_em`:** gravada uma vez, na transição para `enviada`.
- **Não-regressão:** `lint`, `typecheck`, `build`, `format:check`; migrations idempotentes; migração em
  produção antes do deploy (Fatia A).

## Fora de escopo

| O quê | Por quê |
|---|---|
| Canais mistos por passo / dois canais por passo | Decidido: um canal fixo para a sequência. |
| Pausa/retomada manual por proposta | Gatilho automático; sem controle manual (YAGNI). |
| Resposta do cliente encerrar a sequência automaticamente | Encerra por aceite/recusa; ler resposta é outra integração. |
| Opt-out do prospect | Prospect ainda não é cliente; o opt-out da régua é de cliente. Fora daqui. |
| Configurar o agendador externo | É infra (EasyPanel/cron); o design só expõe a URL do cron. |

## Riscos

| Risco | Mitigação |
|---|---|
| Cron não adicionado ao agendador → nunca dispara | Sinalizado como passo de operação da Fatia B (junto do deploy). |
| Reenvio duplicado | `unique(proposta_id, etapa_id)` + registro `sem_destino` para não repetir tentativas vazias. |
| Relógio reiniciar se a proposta for reenviada | `enviada_em` só é gravada na 1ª transição (`coalesce`). |
| Proposta sem contato no canal | Passo vira `sem_destino` (registrado, visível na Fatia C); não trava o motor. |
