# Sincronização de boletos com o Banco Inter — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Contas a Receber) + cron

## Contexto

A baixa automática depende de o Inter chamar nosso webhook no momento do pagamento. Webhooks não são
100% confiáveis: pagamentos durante indisponibilidade, webhooks perdidos, ou pagos **antes** do webhook
ser cadastrado (caso real: boleto #35, pago ~5h antes do registro do webhook) ficam sem baixa. Falta uma
**reconciliação**: consultar no Inter a situação dos boletos em aberto e baixar os que já estão pagos lá.

Esta entrega adiciona: (A) um botão manual "Sincronizar boletos pagos (Inter)" em Contas a Receber, e (B)
um cron diário que roda a mesma sincronização sozinho.

## Decisões

1. **Só Inter** (Asaas tem seu próprio webhook no painel do Asaas).
2. **Reusa a lógica de baixa do webhook**, extraída para uma função compartilhada `baixarBoletoPago`
   (idempotente — não baixa duas vezes; o guard `status='pago'` já existe). Webhook e sincronização usam
   a mesma regra.
3. **Core sem sessão de usuário:** a sincronização roda com `createAdminSupabase()` (service_role), sem
   gate de papel — para o cron (que não tem sessão) e para a action (que gateia antes de chamar o core),
   como os outros crons do projeto.
4. **Valor da baixa = valor do boleto** (como o webhook faz hoje; reconciliação de divergência fica fora).
5. **Endpoint/shape confirmados ao vivo** com o #35 (`GET /cobranca/v3/cobrancas/{cod}`, campo `situacao`
   provavelmente em `cobranca.situacao`); ajusto se divergir.

## Arquitetura

### Adaptador — consultar situação

`ProvedorBoleto` ganha método opcional:
```ts
consultarPagamento?(provedorBoletoId: string): Promise<EventoPagamento | null>;
```
Inter: `GET /cobrancas/{cod}` → `interpretarSituacaoInter(cod, resp)`. Função pura `interpretarSituacaoInter`
lê `resp.cobranca.situacao` (RECEBIDO/MARCADO_RECEBIDO/PAGO ⇒ pago) e devolve `EventoPagamento`
(`provedorBoletoId, pago, valorPago, pagoEm`) ou `null` quando não pago. Reaproveita a mesma lista de
situações de `interpretarWebhookInter`.

### Baixa compartilhada — `src/lib/boleto/baixa.ts` (ou novo módulo server)

Extrair a orquestração da baixa hoje embutida na rota do webhook para:
```ts
// admin: SupabaseClient service_role; boleto: { id, titulo_id, valor, status };
// devolve true se baixou (novo), false se já estava pago/cancelado ou faltou conta.
export async function baixarBoletoPago(
  admin, boleto: { id: string; titulo_id: string; valor: number; status: string },
  evento: EventoPagamento, contaBancariaId: string | null, hoje: string,
): Promise<boolean>;
```
Faz o guard (`status !== pago/cancelado`, `contaBancariaId` presente), `insert baixa` (via
`dadosBaixaBoleto`, forma "BOLETO"), `update boleto status='pago'`. O trigger `recalcular_status_titulo`
fecha o título. A **rota do webhook passa a chamar `baixarBoletoPago`** (mesma lógica, sem duplicar).

### Core da sincronização — `src/app/(app)/financeiro/contas-a-receber/sincronizar.ts`

```ts
export async function sincronizarBoletosCore(): Promise<{ baixados: number }>;
```
Com `createAdminSupabase()`: lê `boleto_config` (provedor, conta_bancaria_id); se ≠ inter → `{baixados:0}`;
`adaptadorAtivo()` (já lê a config via admin); busca boletos `status='emitido'` do provedor inter; para
cada um chama `adaptador.consultarPagamento(provedor_boleto_id)` e, se pago, `baixarBoletoPago(...)`.
Retorna o total baixado.

### Fatia A — botão manual

Action `sincronizarBoletosInter()` em `boleto-actions.ts`: gate `podeGerenciarFinanceiro`, chama
`sincronizarBoletosCore()`, `revalidatePath`, devolve `{ baixados }` ou `{ erro }`. Botão
**"Sincronizar boletos pagos (Inter)"** em `ContasReceber.tsx` (recarrega a lista após), com mensagem
"N boleto(s) baixado(s)".

### Fatia B — cron diário

- Rota `src/app/api/cron/sincronizar-boletos/route.ts`: autentica por `CRON_SECRET` (mesmo padrão de
  `tarefas-recorrentes` — `timingSafeEqual`), chama `sincronizarBoletosCore()`, devolve o resumo.
- `scripts/bootstrap-cron.mjs`: novo job `sincronizar-boletos-diaria` (ex.: `0 13 * * *`), com body,
  igual aos outros HTTP jobs. Aplicado em produção rodando `npm run cron:bootstrap` (via
  `.env.producao.bak`) — passo operacional no release, como as migrations.

## Testes

- `src/tests/boleto/situacao.test.ts` — `interpretarSituacaoInter`: pago para RECEBIDO/MARCADO_RECEBIDO/PAGO;
  null para A_RECEBER/situação ausente; lê valor/data quando presentes.
- Render do botão de sincronização em Contas a Receber.
- A baixa real (rede + Storage/DB) e o cron não rodam em teste local — a lógica pura (`interpretarSituacaoInter`,
  `dadosBaixaBoleto`) é testada isolada; a baixa end-to-end é validada com o #35 ao clicar em produção.

## Fatiamento

- **Fatia A — sincronização manual:** adaptador `consultarPagamento` + `interpretarSituacaoInter` +
  extração `baixarBoletoPago` (e webhook passa a usá-la) + `sincronizarBoletosCore` + action + botão.
  Entrega o botão que resolve o #35 já.
- **Fatia B — cron diário:** rota `/api/cron/sincronizar-boletos` + job no `bootstrap-cron.mjs`.

## Constraints do projeto (herdadas)

- Gate da action = `podeGerenciarFinanceiro`; cron autenticado por `CRON_SECRET` (server-only).
- `bootstrap-cron.mjs` é a fonte de verdade dos jobs pg_cron (não é migration); aplicar com `npm run cron:bootstrap`.
- Storage/segredos server-only. Guard `divida-ui`: sem `border` estático em input; sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam. Sem migration.

## Fora de escopo

- Sincronização do Asaas.
- Reconciliação de valor divergente (juros/desconto) — usa o valor do boleto.
- Reprocessar boletos `cancelado`/`erro` (só `emitido` é consultado).
