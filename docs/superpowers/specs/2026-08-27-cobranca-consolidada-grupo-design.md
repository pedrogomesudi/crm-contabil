# Cobrança consolidada por grupo — Design

**Data:** 2026-08-27
**Status:** Aprovado (design) — pendente escrita do plano

## Objetivo

Permitir que um conjunto de empresas dos mesmos donos seja cobrado por um **único boleto
consolidado**, mantendo a **emissão de NF individual por CNPJ**. São 3 grupos hoje, mas o recurso
é genérico (N grupos).

Regra central:
- **NF:** uma por CNPJ (comportamento atual, sem mudança).
- **Boleto:** um só por grupo, no CNPJ de uma **empresa titular** escolhida, somando os honorários
  de todas as empresas do grupo na competência.

## Conceito: Grupo de cobrança

Entidade nova, **independente** de grupo econômico e de matriz/filial (que já existem para outros
fins). O usuário monta cada grupo manualmente:
- Um **nome** e uma **empresa titular** (uma das empresas do grupo).
- **Membros:** as empresas (clientes) que compõem o grupo. Cada cliente pertence a **no máximo um**
  grupo de cobrança. A titular também é membro.

## Modelo de dados

- `grupo_cobranca`: `id`, `nome`, `titular_cliente_id → clientes(id)`, `criado_em`, `criado_por`.
- `clientes.grupo_cobranca_id → grupo_cobranca(id) on delete set null` — vínculo do membro ao grupo
  (1 grupo por cliente). Constraint: a titular deve ser membro do próprio grupo.
- **Boleto cobrindo vários títulos:** hoje `boleto.titulo_id` é `NOT NULL` (1:1). Passa a:
  - `boleto.titulo_id` **nullable** (boletos individuais continuam preenchendo-o);
  - `boleto.grupo_cobranca_id` (preenchido nos boletos de grupo);
  - tabela de ligação `boleto_titulo(boleto_id, titulo_id, valor)` — para o boleto de grupo,
    registra explicitamente os N títulos (um por empresa) e o valor de cada, base da baixa.

## Fluxos

### 1. Montagem dos grupos (UI)
Tela de gestão de grupos de cobrança (em Financeiro): criar/editar grupo, definir titular,
adicionar/remover empresas. Na ficha do cliente, exibir a qual grupo de cobrança ele pertence e,
para a titular, o resumo do grupo.

### 2. Emissão de NF — individual (sem mudança)
A geração de mensalidades cria o título de honorário de cada empresa; a emissão de NF em lote
emite uma NF por CNPJ. Nenhuma mudança — o grupo não afeta a NF.

### 3. Geração do boleto — consolidado
Na "Gerar boletos em lote" de uma competência:
- Empresas **em grupo** não geram boleto individual.
- Para cada grupo com honorários na competência, gera **um** boleto na **titular**:
  - **valor** = soma dos honorários (títulos MENSALIDADE em aberto) das empresas do grupo;
  - **pagador** = dados da titular (CNPJ, endereço);
  - **vencimento** = dia de vencimento da **titular**;
  - **observações (mensagem do boleto)** = **razão social + CNPJ de cada empresa** do grupo;
  - liga o boleto aos N títulos via `boleto_titulo`.
- Idempotência: um grupo já com boleto na competência não gera outro.

### 4. Baixa — automática em todos os títulos
Quando o boleto de grupo é **pago** (webhook Inter):
- o sistema baixa **cada título** ligado em `boleto_titulo`, pelo seu valor, na data do pagamento;
- cada empresa fica com seu honorário quitado (o gatilho de status já cuida do `BAIXADO`).

### 5. Envio — tudo para a titular
No envio automático de honorários (WhatsApp/e-mail):
- para cada grupo, um único envio **para a titular**, contendo o **boleto do grupo** + as **NFs de
  todas as empresas** do grupo;
- as empresas não-titulares não recebem envio próprio (a NF delas vai no pacote da titular).

## Observações do boleto (mensagem)

O adaptador Inter hoje **não** envia mensagem; a API dele aceita `mensagem.linha1..linha5`. Será
estendido para enviar, com a lista "RAZÃO SOCIAL — CNPJ" de cada empresa.

**Limite:** 5 linhas (~78 caracteres cada). Grupos com muitas empresas ou nomes longos podem não
caber. Mitigação da v1: preencher o que couber nas 5 linhas e, se exceder, resumir (ex.: nomes
abreviados ou só CNPJs) — o detalhamento completo vai também no e-mail/mensagem do envio. A
regra exata de corte é definida no plano.

## O que muda nos componentes existentes

- **Geração de boletos em lote** (`ContasReceber` / `boleto-actions`): desvia empresas em grupo
  para a rotina de boleto consolidado.
- **Webhook de baixa do boleto** (`sincronizar`/webhook Inter): ao pagar um boleto de grupo,
  baixa os N títulos.
- **Adaptador Inter** (`inter.ts`, `emissao.ts`, `tipos.ts`): novo campo de mensagem/observações.
- **Envio de honorários** (`nfse/lote/envio` e régua): caminho de grupo → titular com boleto + NFs.
- **Cadastro/ficha do cliente** e **contas a receber**: exibir vínculo de grupo e o boleto único.

## Escopo e fases (sugestão para o plano)

- **Fase 1 — Fundação:** tabelas (`grupo_cobranca`, `clientes.grupo_cobranca_id`, `boleto_titulo`,
  `boleto.titulo_id` nullable + `grupo_cobranca_id`); tela de gestão de grupos; exibição na ficha.
- **Fase 2 — Boleto consolidado:** geração do boleto de grupo (valor somado, titular, vencimento,
  ligação `boleto_titulo`) + observações no Inter.
- **Fase 3 — Baixa e envio:** baixa múltipla no webhook; envio consolidado para a titular (boleto
  + NFs do grupo).

## Riscos / pontos de atenção

- **Limite de mensagem do Inter** para grupos grandes (mitigação acima).
- **Datas de vencimento divergentes** entre membros: o boleto usa o dia da titular (decidido).
- **Consistência da baixa parcial/estorno** de boletos de grupo (o estorno deve reverter os N
  títulos) — tratado na Fase 3.
- **Migração de dados:** nenhuma nota/boleto existente muda; só passa a existir a opção de grupo.
