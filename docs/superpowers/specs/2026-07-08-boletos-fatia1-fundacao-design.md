# Boletos — Fatia 1: fundação + seletor de provedor — Design

**Data:** 2026-07-08
**Marco:** a base do módulo de boletos — configurar/escolher o provedor (Inter ou Asaas) com credenciais
cifradas, e definir o contrato que os adaptadores (Fatias 2–3) vão implementar. **Nada emite ainda.**

**Contexto:** existe `titulo` (contas a receber, com baixa), cripto AES-GCM (`cifrar/decifrar` em
`src/lib/nfse/cripto.ts`), infra de certificado/mTLS do NFS-e (reuso futuro no Inter) e o padrão de config
singleton (`whatsapp_config`, `dados_bancarios`). Gate financeiro: `podeGerenciarFinanceiro`
(admin/financeiro) em `src/lib/financeiro/permissoes.ts`. Cripto por domínio: cada área usa sua chave
(`WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`).

## Decisões (do brainstorming)

1. Módulo decomposto em 4 fatias; esta é a **Fatia 1 (fundação)** — construível/testável sem conta.
2. Suportar **os dois** provedores com um seletor; aqui entra só a config + o contrato.

## Escopo (Fatia 1)

- Migration `boleto_config` (singleton) com credenciais cifradas por provedor.
- Wrapper de cripto dedicado (`BOLETO_CRIPTO_KEY`).
- Contrato `ProvedorBoleto` + tipos de emissão/webhook.
- Helper puro `statusConfigBoleto`.
- Actions + UI: Configurações → Boletos (seletor + credenciais).

**Fora (Fatias 2–4):** adaptadores reais (Asaas/Inter), tabela `boleto`, emissão a partir do título,
webhook de baixa, envio do link.

## Dados — migration `0058_boleto_config.sql`

```sql
do $$ begin create type boleto_provedor as enum ('nenhum','inter','asaas'); exception when duplicate_object then null; end $$;
do $$ begin create type boleto_ambiente as enum ('sandbox','producao'); exception when duplicate_object then null; end $$;

create table if not exists boleto_config (
  id int primary key default 1,
  provedor boleto_provedor not null default 'nenhum',
  asaas_api_key_cifrada text,
  asaas_ambiente boleto_ambiente not null default 'producao',
  inter_client_id_cifrado text,
  inter_client_secret_cifrado text,
  inter_conta_corrente text,
  inter_cert_cifrado text,
  inter_key_cifrado text,
  atualizado_em timestamptz not null default now(),
  constraint boleto_config_singleton check (id = 1)
);
alter table boleto_config enable row level security;
drop policy if exists boleto_config_rw on boleto_config;
create policy boleto_config_rw on boleto_config for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));
insert into boleto_config (id) values (1) on conflict (id) do nothing;
```
Credenciais **cifradas** (colunas `*_cifrada/_cifrado`). RLS por papel (admin/financeiro) = alinhada ao gate.

## Cripto — `src/lib/boleto/cripto.ts`

```ts
import { cifrar, decifrar } from "@/lib/nfse/cripto";
function chave(): string { /* process.env.BOLETO_CRIPTO_KEY, lança se ausente */ }
export function cifrarCredencial(valor: string): string;
export function decifrarCredencial(pacote: string): string;
```
Chave dedicada **`BOLETO_CRIPTO_KEY`** (definir 1× no EasyPanel antes de salvar credenciais; nunca trocar
depois de gravar dados cifrados). O `decifrarCredencial` só será usado pelos adaptadores (Fatias 2–3).

## Contrato dos adaptadores — `src/lib/boleto/tipos.ts`

```ts
export type BoletoProvedor = "inter" | "asaas";
export type DadosEmissao = { valor: number; vencimento: string; pagadorNome: string; pagadorDocumento: string; pagadorEmail: string | null; descricao: string; seuNumero: string };
export type BoletoEmitido = { provedorBoletoId: string; nossoNumero: string | null; linhaDigitavel: string | null; pixCopiaCola: string | null; urlPdf: string | null };
export type EventoPagamento = { provedorBoletoId: string; pago: boolean; valorPago: number | null; pagoEm: string | null };
export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
}
```
Só tipos/interface — o "encaixe" que Asaas (Fatia 2) e Inter (Fatia 3) implementarão.

## Helper puro — `src/lib/boleto/config.ts` (TDD)

```ts
export type ConfigBoletoView = { provedor: "nenhum" | "inter" | "asaas"; asaasAmbiente: "sandbox" | "producao"; interContaCorrente: string | null; asaasApiKeyDefinida: boolean; interClientIdDefinido: boolean; interClientSecretDefinido: boolean; interCertDefinido: boolean; interKeyDefinida: boolean };
export function statusConfigBoleto(c: ConfigBoletoView): { provedor: string; configurado: boolean };
```
Regras: `asaas` → configurado se `asaasApiKeyDefinida`; `inter` → configurado se client_id + client_secret +
cert + key + conta_corrente presentes; `nenhum` → não configurado.

## Actions — `src/app/(app)/configuracoes/boletos/actions.ts`

```ts
export async function obterConfigBoleto(): Promise<ConfigBoletoView>;
export type SalvarInput = { provedor: "nenhum" | "inter" | "asaas"; asaasAmbiente: "sandbox" | "producao"; interContaCorrente: string | null; asaasApiKey?: string | null; interClientId?: string | null; interClientSecret?: string | null; interCert?: string | null; interKey?: string | null };
export async function salvarConfigBoleto(input: SalvarInput): Promise<{ ok?: boolean; erro?: string }>;
```
- Gate `podeGerenciarFinanceiro` em ambas.
- `obterConfigBoleto`: lê `boleto_config` (id=1); retorna `provedor`, `asaasAmbiente`, `interContaCorrente`
  e os booleanos `*Definida/Definido` (coluna cifrada não-nula/não-vazia). **Nunca** devolve segredo.
- `salvarConfigBoleto`: atualiza `provedor`/`asaas_ambiente`/`inter_conta_corrente` e `atualizado_em`;
  para cada credencial recebida **não-vazia**, cifra (`cifrarCredencial`) e grava; campo vazio/omisso =
  mantém o valor atual (padrão do `whatsapp_config`).

## UI

### `configuracoes/boletos/page.tsx` (server) + `FormBoletos.tsx` (client)
Gate `podeGerenciarFinanceiro` (senão redirect). Carrega `obterConfigBoleto()`.
- **`FormBoletos`**: seletor **Provedor** (Nenhum / Asaas / Inter). Conforme a escolha, mostra os campos:
  - **Asaas:** API key (password; placeholder "•••• já definida" se `asaasApiKeyDefinida`), ambiente
    (sandbox/produção).
  - **Inter:** client_id, client_secret (password), conta corrente, certificado (textarea PEM), chave
    (textarea PEM) — cada segredo com indicador "já definido" quando aplicável.
  - Campos de segredo em branco = não alteram. Botão **Salvar** (`salvarConfigBoleto`).
- Um aviso: "A emissão de boletos entra nas próximas fatias; aqui você só configura o provedor."

### Configurações (índice)
Adicionar um card/link **"Boletos"** → `/configuracoes/boletos` na página `configuracoes/page.tsx` (visível
a `podeGerenciarFinanceiro`; hoje o índice é admin — ver nota abaixo).

> **Nota de acesso:** o índice `/configuracoes` é admin-only. Para não ampliar isso agora, o card de
> Boletos aparece no índice para admin, e a **rota** `/configuracoes/boletos` é gated por
> `podeGerenciarFinanceiro` (admin/financeiro acessam direto pela URL). Alinhamento fino de menu para
> financeiro fica fora desta fatia.

## Tratamento de erros
- Sem permissão → redirect / `{ erro }`.
- `BOLETO_CRIPTO_KEY` ausente ao salvar credencial → o wrapper lança; a action captura e retorna
  `{ erro: "BOLETO_CRIPTO_KEY não configurada." }`.
- Provedor `nenhum` → salva sem exigir credenciais.

## Testes
- **Unit (Vitest):** `statusConfigBoleto` (asaas com/sem key; inter completo/incompleto; nenhum).
- **Smoke:** `FormBoletos` renderiza o seletor e os campos do provedor ativo sem lançar.

## Migrations
`0058_boleto_config.sql` (enums + tabela singleton + RLS + seed do id=1).
