# RF-005 — Assinatura do contrato de honorários a partir da proposta — Design

**O que é:** uma seção guiada **"Contrato de honorários"** no editor da proposta que mostra, em três passos
com status, o caminho até o contrato assinado — Converter em cliente → Gerar contrato → Enviar para
assinatura — cada passo levando à tela/ação que **já existe**. Fecha a RF-005. Uma fatia; sem migration.

## O estado de hoje (medido)

- A **Clicksign já opera** para documentos de cliente: `enviarParaAssinatura({ pdf, nome, signatarios })`
  (`lib/assinatura/clicksign.ts`), `baixarAssinado`, o webhook (`/api/webhooks/clicksign`) e as tabelas
  `assinaturas` (ancorada em `cliente_id`, status `enviado|parcial|finalizado|recusado|cancelado`) e
  `assinatura_signatarios` (`0018`).
- O **contrato de honorários** já é gerado: `gerarContrato(clienteId)` (`clientes/[id]/contrato.ts`)
  preenche `templates/contrato-prestacao-servicos.docx` com os dados do cliente + `honorario_mensal`,
  converte em PDF e salva em `documentos` com **`tipo = 'Contrato'`**. E é assinado pelo componente
  `EnviarAssinatura({ documentoId, clienteId, signatarios })` → `enviarAssinatura(documentoId, clienteId)`.
- A **oportunidade ganha** já tem o botão "Converter em cliente" (`/clientes/novo?oportunidade=<id>`); ao
  converter, `oportunidade.cliente_id` é preenchido.
- **O que falta (RF-005):** partir da proposta. Gerar e assinar já funcionam no cliente; não há, na
  proposta, a ponte que mostra e conduz esses passos.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo | **Ponte de leitura + navegação** — a seção mostra status e leva às telas existentes | Gerar/assinar já funcionam; duplicar seria dívida. |
| Documento assinado | **O contrato de honorários existente** (`documentos.tipo = 'Contrato'`, o PDF) | O modelo já implantado; não é a proposta nem um template novo. |
| Detecção do contrato | **`documentos.tipo = 'Contrato'`** do cliente | É o marcador que o `gerarContrato` grava. |
| Onde | **Cartão no editor da proposta** (`/comercial/propostas/[id]`) | É de onde o comercial parte após o aceite. |
| Passos embutidos? | **Não — linka para as telas existentes** | Reusa `gerarContrato`/`enviarAssinatura` sem reconstruir. |

## Arquitetura

### A lógica pura (`lib/comercial/contratoProposta.ts`)

```ts
export type EstadoContrato = {
  oportunidadeId: string;
  clienteId: string | null;
  contratoDocId: string | null;         // documento PDF tipo 'Contrato' do cliente (o mais recente), ou null
  assinaturaStatus: string | null;      // status da assinatura desse documento, ou null
  propostaAceita: boolean;
};
export type Passo = {
  chave: "converter" | "gerar" | "assinar";
  rotulo: string;
  situacao: "feito" | "atual" | "pendente";
  href: string | null;                  // destino do passo (só quando faz sentido navegar)
  detalhe?: string;                     // ex.: status da assinatura por extenso
};

export function passosContrato(e: EstadoContrato): Passo[];
export function rotuloStatusAssinatura(status: string | null): string;
```

Regras de `passosContrato`:
- **feito** por passo: `converter` se `clienteId`; `gerar` se `contratoDocId`; `assinar` se
  `assinaturaStatus === 'finalizado'`.
- O **primeiro passo não-feito** vira `atual`; os não-feitos seguintes ficam `pendente`. Se todos feitos,
  todos `feito`.
- **hrefs:** `converter` → `clienteId ? /clientes/<clienteId> : /clientes/novo?oportunidade=<oportunidadeId>`;
  `gerar` e `assinar` → `clienteId ? /clientes/<clienteId> : null` (destino é a tela do cliente). Passos
  `pendente` sem cliente ficam com `href = null` (não navegam ainda).
- `assinar.detalhe = rotuloStatusAssinatura(assinaturaStatus)`.
- `rotuloStatusAssinatura`: `enviado`→"Enviado — aguardando assinatura", `parcial`→"Parcialmente assinado",
  `finalizado`→"Assinado", `recusado`→"Recusado", `cancelado`→"Cancelado", `null`→"Não enviado".

### A leitura (server, no `[id]/page.tsx`)

`carregarEstadoContrato(oportunidadeId: string): Promise<EstadoContrato>` (gate `podeCriarCliente`):
- `oportunidade.cliente_id` (→ `clienteId`) e `oportunidade` para o `oportunidadeId`.
- Se `clienteId`: o `documentos` mais recente com `tipo = 'Contrato'` e nome `.pdf` do cliente
  (→ `contratoDocId`); e, se houver, a `assinaturas` mais recente com `documento_id = contratoDocId`
  (→ `assinaturaStatus`).
- `propostaAceita` vem do `proposta.status` (o editor já tem a proposta).

> RLS: `documentos`/`assinaturas` são de cliente (admin/assistente veem; contador só dos próprios). O
> comercial que abre a proposta enxerga pelo seu papel; um contador sem acesso ao cliente veria os passos 2/3
> como pendentes — aceitável (a seção orienta, não expõe dado sensível).

### A seção (`ContratoHonorarios.tsx`, client)

Cartão **"Contrato de honorários"** no editor da proposta, abaixo dos Itens. Recebe `passos: Passo[]` e
`propostaAceita: boolean`. Renderiza um **stepper vertical**:
- Cada passo: indicador (✓ feito · cheio no atual · apagado no pendente), rótulo, e — no passo **atual** com
  `href` — um botão/link para a tela. O passo `assinar` mostra `detalhe` (status por extenso).
- Se **não** `propostaAceita`: uma nota discreta "Marque a proposta como aceita para seguir com o contrato",
  mantendo o passo 1 como entrada (sem travar).
- Todos feitos + assinatura `finalizado`: estado de conclusão "Contrato de honorários assinado" (com link
  para o cliente/documento).

## Fatia de implementação

Uma fatia: a lógica pura + o leitor server + a seção + integração no editor + release.

## Verificação

- **Lógica testável:** `passosContrato` (feito/atual/pendente por estado; hrefs; sem cliente) e
  `rotuloStatusAssinatura`.
- **Render:** o stepper com os três passos; a nota quando a proposta não está aceita; o estado de conclusão.
- **Não-regressão:** `lint`, `typecheck`, `build`, `format:check`.
- **Sem migration** — usa `oportunidade`, `documentos`, `assinaturas` existentes.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Gerar/assinar embutido na proposta | Já existe no cliente; a seção linka. |
| Levar o valor mensal da proposta para o honorário do cliente | É a conversão/onboarding; a ponte só orienta (opção "um clique" foi descartada). |
| Assinar a própria proposta | O documento assinado é o contrato de honorários, não a proposta. |
| Novo template de contrato | Reusa o `contrato-prestacao-servicos.docx` já implantado. |

## Riscos

| Risco | Mitigação |
|---|---|
| Contador sem acesso ao cliente vê passos 2/3 como pendentes | Aceito: a seção orienta; não vaza dado. O admin/assistente enxerga o fluxo completo. |
| Cliente com mais de um documento `tipo='Contrato'` | Pega o **mais recente** (PDF); é o contrato vigente para assinar. |
| Passo "gerar" sem detectar o contrato recém-criado | A leitura é server-side a cada carga da proposta; ao voltar do cliente, o status reflete. |
