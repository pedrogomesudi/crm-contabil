# Boletos — Fatia 4a: emissão — Design

**Data:** 2026-07-08
**Marco:** emitir um boleto a partir de um título (contas a receber) usando o provedor ativo (Asaas/Inter),
gravar o boleto e exibir a linha digitável/PIX. Sem webhook/baixa (4b).

**Contexto:** existem `titulo` (contas a receber; status ABERTO/VENCIDO/BAIXADO/…), `baixa` (+ trigger
`trg_status_titulo` que marca o título BAIXADO), `conta_bancaria` (id, nome, ativa), `clientes.endereco`
(jsonb: cep/logradouro/numero/bairro/cidade/uf). Fatias 1–3: `boleto_config` (credenciais cifradas),
adaptadores `criarAdaptadorAsaas`/`criarAdaptadorInter` (`ProvedorBoleto`), `decifrarCredencial`,
`DadosEmissao` (com `pagadorEndereco?`). Gate `podeGerenciarFinanceiro`.

## Escopo (4a)

- Migration: tabela `boleto` + `boleto_config.conta_bancaria_id` + função `proximo_numero_boleto()`.
- Config: seletor de conta bancária no `FormBoletos`.
- Fábrica `adaptadorAtivo()` (decifra config → adaptador).
- Helper puro `dadosEmissaoDeTitulo`.
- Action `emitirBoleto(tituloId)`.
- UI em contas a receber: emitir + exibir o boleto.

**Fora (4b):** rota de webhook, baixa automática, envio do link por WhatsApp.

## Dados — migration `0059_boleto.sql`

```sql
do $$ begin create type boleto_status as enum ('emitido','pago','cancelado','erro'); exception when duplicate_object then null; end $$;
create sequence if not exists boleto_numero_seq;

create table if not exists boleto (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulo(id) on delete cascade,
  numero bigint not null default nextval('boleto_numero_seq'),
  provedor text not null,
  provedor_boleto_id text,
  nosso_numero text,
  linha_digitavel text,
  pix_copia_cola text,
  url_pdf text,
  valor numeric(15,2) not null,
  vencimento date not null,
  status boleto_status not null default 'emitido',
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id) default auth.uid(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_boleto_titulo on boleto(titulo_id);
create index if not exists idx_boleto_provedor_id on boleto(provedor_boleto_id);
alter table boleto enable row level security;
drop policy if exists boleto_rw on boleto;
create policy boleto_rw on boleto for all
  using (auth_papel() in ('admin','financeiro')) with check (auth_papel() in ('admin','financeiro'));

alter table boleto_config add column if not exists conta_bancaria_id uuid references conta_bancaria(id);

create or replace function proximo_numero_boleto() returns bigint language sql security definer as $$ select nextval('boleto_numero_seq'); $$;
grant execute on function proximo_numero_boleto() to authenticated;
```
`numero` (sequência) vira o `seuNumero` do boleto (≤ 15 díg do Inter). `security definer` p/ usar a sequência via RPC.

## Config — conta bancária (arquivos da Fatia 1)

- `ConfigBoletoView` (`src/lib/boleto/config.ts`) ganha `contaBancariaId: string | null` (não afeta
  `statusConfigBoleto`).
- `obterConfigBoleto` retorna `contaBancariaId`; `SalvarInput`/`salvarConfigBoleto` gravam
  `conta_bancaria_id`.
- `FormBoletos` ganha um **seletor de conta bancária** (lista carregada na página de config: contas ativas).

## Fábrica — `src/lib/boleto/ativo.ts` (servidor)

```ts
export async function adaptadorAtivo(): Promise<{ adaptador: ProvedorBoleto; provedor: "inter" | "asaas" } | { erro: string }>;
```
Lê `boleto_config`; se `nenhum` → `{ erro }`. Para `asaas`: exige `asaas_api_key_cifrada`, cria
`criarAdaptadorAsaas(decifrarCredencial(...), asaas_ambiente)`. Para `inter`: exige client_id/secret/cert/
key/conta_corrente, cria `criarAdaptadorInter(...)` (ambiente `producao`). Falha ao decifrar (env ausente)
→ `{ erro: "BOLETO_CRIPTO_KEY não configurada ou credenciais inválidas." }`.

## Helper puro — `src/lib/boleto/emissao.ts` (TDD)

```ts
export function dadosEmissaoDeTitulo(
  titulo: { valor: number; vencimento: string; descricao: string | null },
  cliente: { razaoSocial: string; cpfCnpj: string; email: string | null; endereco: Record<string, string> | null },
  numero: number,
): DadosEmissao;
```
- `valor`/`vencimento` do título; `descricao` = `titulo.descricao ?? "Honorários"`; `seuNumero = String(numero)`.
- `pagadorNome` = razaoSocial; `pagadorDocumento` = dígitos do CNPJ/CPF; `pagadorEmail` = email.
- `pagadorEndereco`: se houver `endereco` com cep/logradouro/cidade, monta `{ cep(dígitos), logradouro,
  numero, bairro, cidade, uf }`; senão `null`.

## Action — `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`

```ts
export type BoletoView = { id: string; numero: number; provedor: string; linhaDigitavel: string | null; pixCopiaCola: string | null; urlPdf: string | null; status: string };
export async function emitirBoleto(tituloId: string): Promise<{ ok?: boolean; erro?: string }>;
export async function listarBoletosDaCompetencia(competencia: string): Promise<Record<string, BoletoView>>; // por titulo_id
```
- `emitirBoleto`: gate `podeGerenciarFinanceiro`. Carrega o título (deve estar `ABERTO`/`VENCIDO`); se já
  houver boleto com status ∉ {cancelado, erro} para o título → `{ erro: "Já existe boleto para este título." }`.
  Carrega o cliente. `const numero = await supabase.rpc("proximo_numero_boleto")`. Monta `DadosEmissao`
  (`dadosEmissaoDeTitulo`). `adaptadorAtivo()`; se `erro` → devolve. `adaptador.emitir(dados)` em try/catch
  (erro → `{ erro: "Falha na emissão: …" }`). Insere o `boleto` (numero + resultados). `revalidatePath`.
- `listarBoletosDaCompetencia`: junta os títulos da competência com seus boletos ativos → mapa
  `titulo_id → BoletoView` (o mais recente não cancelado). Gate financeiro.

## UI — contas a receber

- `page.tsx`: além de `listarTitulos`, chamar `listarBoletosDaCompetencia(competencia)` e passar o mapa.
- Componente `BoletoTitulo.tsx` (client) por título:
  - **sem boleto:** botão **"Emitir boleto"** (`emitirBoleto(tituloId)`; alerta o erro; `router.refresh`).
  - **com boleto:** mostra **linha digitável** (com botão copiar), **PIX copia-e-cola** (copiar), link
    **PDF** (se houver) e o **status**.
- Só aparece para `podeGerenciarFinanceiro`. Emitir sem provedor configurado → erro amigável (esperado até
  a conta existir).

## Tratamento de erros
- Sem provedor/credencial/env → `{ erro }` (a UI mostra alerta).
- Título não-aberto ou já com boleto → `{ erro }`.
- Falha do provedor → `{ erro }` com a mensagem; nenhum boleto gravado.

## Testes
- **Unit (Vitest):** `dadosEmissaoDeTitulo` (com e sem endereço; dígitos do CNPJ; descrição padrão).
- **Smoke:** `BoletoTitulo` — sem boleto mostra "Emitir boleto"; com boleto mostra a linha digitável.

## Migrations
`0059_boleto.sql` (enum + sequência + tabela `boleto` + `boleto_config.conta_bancaria_id` + função `proximo_numero_boleto`).
