# Canal de envio de honorários por cliente (WhatsApp / E-mail / Ambos)

**Data:** 2026-08-09
**Status:** Aprovado (aguardando plano de implementação)

## Problema

Cada cliente deve poder escolher **como recebe seus honorários mensais** (a NFS-e e o
boleto): por **WhatsApp**, por **e-mail**, ou por **ambos**. Hoje:

- O **envio de NFS-e em lote** (`NFS-e → Envio em lote`) é **só WhatsApp** e nem olha o
  e-mail do cliente.
- Não existe envio de nota fiscal por e-mail.
- A preferência de canal existe apenas de forma parcial e pouco visível: dois checkboxes
  ("Cobrar por WhatsApp" / "Cobrar por e-mail") na aba Financeiro da ficha do cliente,
  gravados em `clientes_financeiro.cobranca_whatsapp` e `cobranca_email`.

O usuário quer, no cadastro do cliente, escolher o canal e que o **envio manual de
nota + boleto** respeite essa escolha.

## Decisões de escopo (validadas com o usuário)

1. **Nota + boleto juntos** num único envio por cliente (não dois envios separados).
2. A preferência vale **somente no envio manual em lote**. A **régua de cobrança
   automática não muda**.
3. O seletor de canal aparece em **dois lugares**: no formulário de cadastro
   (criar/editar) e na aba Financeiro (substituindo os dois checkboxes atuais).
4. Na aba Financeiro, **substituir** os dois checkboxes pelo seletor de 3 opções
   (ninguém usa hoje a combinação "nenhum canal": 158 clientes "ambos", 1 "só WhatsApp",
   0 silenciados).

## Modelo de dados

**Sem coluna nova, sem migration.** Reusa os dois flags existentes em
`clientes_financeiro`:

| Seleção no seletor | `cobranca_whatsapp` | `cobranca_email` |
|--------------------|:-------------------:|:----------------:|
| WhatsApp           | `true`              | `false`          |
| E-mail             | `false`             | `true`           |
| Ambos              | `true`              | `true`           |

Default das colunas hoje já é `true`/`true` → equivale a "Ambos", que é o padrão desejado
para cliente novo.

**Coerência com a régua automática (que não muda):** os mesmos flags são lidos pela régua
via `decidirCanal()` (`src/lib/email/regua.ts`), que faz WhatsApp-first com e-mail como
_fallback_. Reusar os flags mantém isso intacto: a única diferença semântica é que o
**envio manual** trata "Ambos" como envio **simultâneo** nos dois canais, enquanto a régua
continua tratando como fallback. Nenhum comportamento da régua é alterado.

Helper puro de mapeamento (canal ↔ flags), testável isoladamente:

```ts
// src/lib/clientes/canal-cobranca.ts
export type CanalCobranca = "whatsapp" | "email" | "ambos";

export function canalParaFlags(canal: CanalCobranca): { whatsapp: boolean; email: boolean } {
  return {
    whatsapp: canal === "whatsapp" || canal === "ambos",
    email: canal === "email" || canal === "ambos",
  };
}

// Deriva o canal a partir dos flags persistidos. Sem nenhum flag (caso legado/silenciado)
// cai em "ambos" — o default histórico — para nunca renderizar um seletor vazio.
export function flagsParaCanal(f: { whatsapp?: boolean | null; email?: boolean | null }): CanalCobranca {
  const wa = f.whatsapp ?? true;
  const em = f.email ?? true;
  if (wa && !em) return "whatsapp";
  if (!wa && em) return "email";
  return "ambos";
}
```

## Componentes

### 1. `SeletorCanalCobranca` (client, compartilhado)

`src/components/clientes/SeletorCanalCobranca.tsx` — um seletor de 3 opções (radios ou
select) para `CanalCobranca`. Dois modos de uso:

- **Controlado / dentro de form** (FormCliente): recebe `value` + `name="canal_cobranca"`
  e apenas reporta a mudança; a persistência é do submit do form.
- **Autônomo com server action** (aba Financeiro): recebe `clienteId` + `inicial` e grava
  na hora via server action, no padrão de `OptOutCobranca` (client component com
  `useTransition`).

Para evitar dois componentes, o seletor renderiza os 3 rádios e aceita
`onChange(canal)` opcional; um wrapper fino em cada lugar decide se grava via action ou só
atualiza o form.

### 2. Cadastro (FormCliente)

- `clienteSchema` (`src/lib/validation/cliente.ts`) ganha
  `canal_cobranca: z.enum(["whatsapp","email","ambos"]).default("ambos")`.
- `FormCliente.tsx` renderiza `SeletorCanalCobranca` na seção "Contato", com
  `name="canal_cobranca"`, pré-selecionado pelo valor atual ao editar.
- `criarClienteNucleo` / `atualizarClienteNucleo` (`src/lib/clientes/gravar.ts`): depois de
  gravar em `clientes`, fazem **upsert** em `clientes_financeiro` (chave `cliente_id`) com
  os flags derivados de `canalParaFlags(canal)`. No cliente novo a linha de
  `clientes_financeiro` pode não existir ainda → upsert por `cliente_id`.
- A página de edição precisa carregar o canal atual (join
  `clientes_financeiro(cobranca_whatsapp, cobranca_email)`) e passar ao form.

### 3. Aba Financeiro (substitui `OptOutCobranca`)

- `OptOutCobranca` deixa de renderizar dois checkboxes e passa a renderizar
  `SeletorCanalCobranca` no modo autônomo.
- A server action `setOptOutCobranca` (`src/app/(app)/financeiro/regua-cobranca/optout.ts`)
  ganha (ou é acompanhada por) uma função `definirCanalCobranca(clienteId, canal)` que
  grava os dois flags de uma vez via `canalParaFlags`. O controle de `aceita_comunicados`,
  se existir hoje nesse componente, é preservado como está.

### 4. Envio unificado "nota + boleto" (evolução de `nfse/lote`)

Arquivo `src/app/(app)/nfse/lote/envio.ts`. A função de envio por cliente deixa de ser
"só WhatsApp" e passa a orquestrar os canais.

**Entrada:** `nfseId` (uma NFS-e autorizada da competência).

**Passos:**
1. Carrega a nota + cliente + `clientes_financeiro(cobranca_whatsapp, cobranca_email,
   dia_vencimento)` + contatos (`telefone`, `telefone_ddi`, `email`).
2. Deriva os canais alvo via `flagsParaCanal`.
3. Localiza o **boleto** do honorário: título `origem = 'MENSALIDADE'` do mesmo
   `cliente_id` e `competencia` → `boleto` ativo (status ∉ {cancelado, erro}) mais recente.
   Campos usados: `linha_digitavel`, `pix_copia_cola`, `pdf_path`/`url_pdf`, `titulo_id`.
   O boleto é **opcional** — se não houver, envia só a nota (a mensagem/e-mail continua
   válida, sem os dados de pagamento do boleto).
4. Monta a **DANFSe PDF** (`obterDanfsePdf`, cache-first — já existe).
5. Monta os dados de pagamento (Pix/dados bancários de `dados_bancarios` + linha
   digitável/Pix do boleto), reusando `linhasPagamento` / `montarMensagemNota`.
6. **WhatsApp** (se canal inclui WA e cliente tem telefone): 1 mensagem, `midia` = DANFSe
   PDF, `texto` = mensagem + linha digitável + Pix copia-e-cola. Reusa o fluxo `nfse` do
   enviador proativo. Registra em `whatsapp_mensagem` (com `nfse_id`), como hoje.
7. **E-mail** (se canal inclui e-mail e cliente tem e-mail): `enviarEmail({ para, assunto,
   corpo, anexos })` com **anexos = [DANFSe PDF, boleto PDF]** (o boleto só se `pdf_path`
   no bucket estiver disponível; senão os dados de pagamento vão no corpo). Registra em
   `email_mensagem` (`cliente_id`, `titulo_id`, `assunto`, `corpo`, `anexos`, `status`,
   `enviado_por`).
8. Retorna um resultado **por canal**: cada canal é `ok | pulado | erro` com motivo. O
   resultado agregado do cliente é "ok" se todos os canais-alvo com contato deram certo,
   "pulado" se nenhum canal tinha contato, senão reporta o(s) erro(s).

**Regras de "pulado":**
- Canal WhatsApp selecionado mas cliente sem telefone → pula WhatsApp com aviso.
- Canal e-mail selecionado mas cliente sem e-mail → pula e-mail com aviso.
- Se **nenhum** canal alvo tem contato → cliente inteiro "pulado".

### 5. UI da tela de envio (`nfse/lote`)

- A listagem por competência mostra, por cliente/nota: **razão social**, **canal**
  (WhatsApp / E-mail / Ambos), indicadores de contato faltante (ex.: "sem e-mail"), e o
  selo **"já enviado"**.
- O selo "já enviado" passa a considerar os **dois** históricos: `whatsapp_mensagem`
  (`nfse_id`) e `email_mensagem` (`titulo_id` da mensalidade). Um cliente "Ambos" só conta
  como totalmente enviado quando os canais aplicáveis foram enviados.
- Botão de envio individual e em lote (mesma mecânica de progresso já existente).
- O texto/rótulos da tela deixam de dizer só "WhatsApp"; passam a refletir nota + boleto e
  os canais.

## Fluxo de dados (envio de um cliente)

```
nfseId
  └─ nota (nfse) + cliente + clientes_financeiro(flags, dia_vencimento) + contatos
       ├─ flagsParaCanal → {whatsapp?, email?}
       ├─ título MENSALIDADE (cliente, competência) → boleto (linha_digitavel, pix, pdf)
       ├─ DANFSe PDF (obterDanfsePdf)
       ├─ dados de pagamento (dados_bancarios + boleto)
       ├─ [se WA & telefone] enviarProativo(nota PDF + texto c/ boleto) → whatsapp_mensagem
       └─ [se e-mail & email]  enviarEmail(corpo + anexos [nota, boleto]) → email_mensagem
  └─ resultado por canal (ok | pulado | erro)
```

## O que **não** muda

- Régua de cobrança automática (`regua-motor.ts`, `decidirCanal`): intacta.
- Schema do banco: nenhuma migration.
- Envio de boleto avulso por WhatsApp em Contas a receber: permanece.

## Testes

Automatizados (Vitest, seguindo o padrão do repo):
- `canalParaFlags` / `flagsParaCanal`: round-trip das 3 opções + caso legado (flags
  nulos → "ambos"; ambos `false` → "ambos" na leitura, sem quebrar seletor).
- Montagem do resultado agregado por canal: casos ok/ok, ok/pulado, pulado/pulado,
  ok/erro.
- Seleção de canais a partir dos flags no envio (mock do cliente): WA-only não dispara
  e-mail; e-mail-only não dispara WhatsApp; ambos dispara os dois.
- "Pulado" por falta de contato (sem telefone / sem e-mail).

Manual (produção, com um cliente de teste):
- Cadastro novo com cada canal → confere flags gravados.
- Edição do canal na aba Financeiro → reflete no cadastro e vice-versa.
- Envio real de um cliente "Ambos" com nota + boleto → chega nos dois canais.

## Riscos e mitigações

- **Cliente sem e-mail (60 de 159):** o envio por e-mail pula com aviso claro na UI; não
  falha o lote. Recomendado sinalizar na listagem quem está como "E-mail"/"Ambos" mas sem
  e-mail cadastrado.
- **Boleto PDF nem sempre disponível no bucket:** e-mail anexa o boleto só quando há
  `pdf_path`; caso contrário, os dados de pagamento (linha digitável/Pix) vão no corpo.
- **Flags compartilhados com a régua:** mudar o canal de um cliente também afeta qual canal
  a régua usa para ele — comportamento coerente e desejável (a preferência é do cliente),
  documentado aqui para não surpreender.

## Versão / entrega

Feature nova → bump minor (`6.90.0` → `6.91.0`), CHANGELOG no mesmo PR, fluxo
develop → PR → merge → deploy manual → tag, conforme `docs/VERSIONAMENTO.md`.
