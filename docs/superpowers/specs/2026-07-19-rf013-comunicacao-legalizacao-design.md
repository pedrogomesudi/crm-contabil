# RF-013 — Comunicação automática de status da legalização — Design

**O que é:** quando uma etapa de legalização marcada "avisar cliente" é concluída, o sistema **envia
automaticamente** o status ao cliente (e-mail ou WhatsApp), no lugar do checkbox manual "cliente avisado" —
com um **interruptor por cliente** (opt-out). Fecha a RF-013. **Uma fatia**; tem migration.

## O estado de hoje (medido)

- O módulo de legalização (`0079`/`0080`) já cobre RF-011/012/014: processos por **órgão** com **protocolo**
  e **prazo**, templates societários por tipo, e o **Termo de acervo NBC PG 01**.
- Cada `legalizacao_etapa` tem a flag **`avisar_cliente`** e a coluna **`cliente_avisado_em`**. Hoje o
  `EtapaLinha` mostra apenas um **checkbox manual** "cliente avisado" (`atualizarEtapa` com
  `clienteAvisado`) — **não há envio automático** (nenhum `enviarEmail`/`zapi` na legalização).
- Os canais existem: `enviarEmail` (`lib/email/enviar`) e `enviarTexto`+`ZapiConfig` (`lib/whatsapp/zapi`),
  com `decifrarDominio` (`lib/cripto/envelope`) para os tokens e `normalizarTelefone`
  (`lib/whatsapp/mensagem`). `aplicarVariaveis` (`lib/comercial/followup`) renderiza templates.
- A régua de cobrança já tem o padrão de **opt-out por cliente** (flags em `clientes_financeiro`).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Gatilho | **Ao concluir uma etapa `avisar_cliente`** (status → `concluido`/`isenta`), imediato, **sem cron** | Event-based; o marco natural do "avise o cliente". |
| Canal | **Configurável global** (e-mail **ou** WhatsApp) | Simples; igual ao follow-up. |
| Opt-out por cliente | **Flag `clientes.comunicar_legalizacao`** (padrão **ligado**) | O escritório desliga por cliente; modelo da régua. |
| Registro | **Reusa `legalizacao_etapa.cliente_avisado_em`** — preenchida no envio | Sem tabela nova; a coluna já existe. |
| Falha de envio | **Não trava a conclusão;** devolve aviso e deixa `cliente_avisado_em` nulo | O operador pode avisar/marcar à mão. |
| Mensagem | **Template configurável** com variáveis | Flexível sem código. |

## Arquitetura

### O modelo de dados (migration 0106)

```sql
create table if not exists legalizacao_config (
  id boolean primary key default true,
  canal text not null default 'email',       -- 'email' | 'whatsapp'
  ativo boolean not null default false,
  assunto text,                              -- usado no canal e-mail
  template text not null default 'Olá {cliente}, a etapa "{etapa}" do processo "{processo}" foi concluída em {data}.'
);
-- check id singleton + canal ∈ (email,whatsapp), no padrão das migrations anteriores.
alter table clientes add column if not exists comunicar_legalizacao boolean not null default true;
```

RLS de `legalizacao_config`: leitura para a equipe (admin/assistente/contador), escrita só admin (padrão da
`0103`). `clientes.comunicar_legalizacao` herda a RLS de `clientes`.

### A lógica pura (`lib/legalizacao/aviso.ts`)

```ts
export type CfgAviso = { ativo: boolean; canal: "email" | "whatsapp" };
export type EtapaAviso = { avisarCliente: boolean; jaAvisado: boolean; concluida: boolean };
// O portão: só avisa se o mestre está ativo, o cliente permite, a etapa pede aviso, está concluída e
// ainda não foi avisada.
export function deveAvisar(cfg: CfgAviso, comunicarCliente: boolean, etapa: EtapaAviso): boolean {
  return cfg.ativo && comunicarCliente && etapa.avisarCliente && etapa.concluida && !etapa.jaAvisado;
}
```

`aplicarVariaveis` (já existe em `lib/comercial/followup`) monta a mensagem — variáveis `{cliente}`,
`{processo}`, `{etapa}`, `{orgao}`, `{protocolo}`, `{data}`.

### O envio (dentro de `atualizarEtapa`)

Após atualizar a etapa, quando o `patch.status` a leva a `concluido`/`isenta`:
- Carrega a etapa completa (avisar_cliente, cliente_avisado_em, orgao, protocolo, titulo, processo_id) e,
  pelo processo, o **cliente** (`comunicar_legalizacao`, `razao_social`, `email`, `telefone`,
  `telefone_ddi`) e o **processo** (`titulo`). Carrega `legalizacao_config`.
- Se `deveAvisar(...)`: renderiza `template`/`assunto` com as variáveis; envia pelo `canal`
  (`enviarEmail({para,assunto,corpo})` ou `enviarTexto(zapi, normalizarTelefone(tel,ddi), corpo)` com o zapi
  decifrado). Em sucesso, grava `cliente_avisado_em = now()`; em falha, devolve `{ ok:true, aviso:"…" }`
  (a conclusão da etapa persiste de qualquer jeito).
- Sem etapa concluída, ou fora do gatilho, o comportamento atual é preservado (o checkbox manual continua).

### As telas

- **`/configuracoes/legalizacao`** ganha uma seção **"Comunicação automática"** (admin): canal + `ativo` +
  `assunto` + `template`, com a legenda das variáveis. Actions no padrão das outras configs (gate admin).
- **`/clientes/[id]`** ganha um interruptor **"Avisar automaticamente o andamento da legalização"**
  (`comunicar_legalizacao`), no molde do opt-out de cobrança.

## Fatia de implementação

Uma fatia: migration + lógica pura + envio no `atualizarEtapa` + a seção de config + o toggle por cliente +
release.

## Verificação

- **Lógica testável:** `deveAvisar` (cada condição do portão) e a renderização por `aplicarVariaveis`.
- **Envio:** não trava a conclusão; grava `cliente_avisado_em` só em sucesso; respeita canal, mestre e a
  flag do cliente.
- **Não-regressão:** o checkbox manual e o resto da legalização seguem funcionando; `lint`, `typecheck`,
  `build`, `format:check`; migration idempotente e aplicada em produção antes do deploy.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Aviso ao protocolar (além de ao concluir) | Decidido: só na conclusão. |
| Canal por cliente / por etapa | Canal é global; opt-out por cliente é on/off, não por canal. |
| Histórico/log de avisos além do `cliente_avisado_em` | A coluna existente basta; um log é outra RF. |
| Cron/reenvio de avisos que falharam | Event-based; a falha vira aviso ao operador (marca/avisa à mão). |

## Riscos

| Risco | Mitigação |
|---|---|
| Falha de envio "sumir" | A action devolve um aviso explícito; `cliente_avisado_em` fica nulo (o operador vê que não avisou). |
| Reenvio duplicado ao reconcluir a etapa | O portão checa `!jaAvisado` (`cliente_avisado_em` preenchido) — não reenvia. |
| Cliente sem contato no canal | `deveAvisar` passa, mas o envio falha → vira aviso ao operador; `cliente_avisado_em` nulo. |
| Envio lento travar a UI | O envio é uma chamada; se preocupar, é a mesma latência do envio de e-mail/WhatsApp já usado no sistema. |
