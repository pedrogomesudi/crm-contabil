# WhatsApp oficial — Fatia 3C: NFS-e em lote com documento anexo — Implementation Plan

**Goal:** fechar o Sub-projeto 3 ligando o último fluxo proativo — **NFS-e em lote** — à camada
`proativo`. É o único que envia **arquivo** (o PDF da DANFSe), e fora da janela de 24h a Meta exige
que ele vá como **template com cabeçalho de documento** — um formato de payload diferente do que as
fatias 3A e 3B construíram.

**Architecture:** a camada de política não aprende o que é "media id". `MensagemProativa` ganha um
campo `midia` opcional e a camada roteia: modo `texto` → `enviarMidia` (exatamente o que acontece
hoje); modo `template` → `enviarTemplate` com o documento junto. O upload para a Meta e o media id
ficam **dentro** do adaptador oficial, onde já vivem hoje para o `enviarMidia`.

**Tech Stack:** Next 16 (server actions), TypeScript, Supabase, Meta Graph API v21.0, vitest.

## Global Constraints

- **Z-API é opção permanente.** Com `exigeTemplateForaDaJanela: false`, `decidirEnvio` devolve
  `texto` e a NFS-e segue por `enviarMidia` com caption — byte a byte o envio de hoje. Requisito de
  verificação.
- **Sem migration.** `whatsapp_template_fluxo` já aceita o fluxo `nfse`.
- O registro em `whatsapp_mensagem` (com `midia_path`, `midia_nome`, `nfse_id`, `z_message_id`) **não
  muda** — é o que alimenta o selo "já enviada" na tela de seleção.
- Rodar antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Decisão desta fatia: o contrato de params do `nfse` vai a quatro posições

A spec fixou `PARAMS_FLUXO.nfse = ["cliente", "competencia"]`. A mensagem que o fluxo monta hoje leva
nome, competência, **valor**, **vencimento** e dados de pagamento. Com duas posições, o template sairia
sem dizer quanto nem até quando — numa mensagem que é, na prática, uma cobrança.

Passa a ser:

```ts
nfse: ["cliente", "competencia", "valor", "vencimento"]
```

PIX/banco não entram: são fixos por escritório e cabem no **corpo aprovado** do template, que é
aprovado no WABA do próprio escritório.

Mudar um contrato publicado é o que a 3B evitou fazer na cobrança manual — a diferença aqui é que o
fluxo `nfse` **nunca chegou a enviar por template**: é justamente o que esta fatia liga. Ninguém pode
depender da ordem antiga ainda. A tela de configuração deriva o contrato de `PARAMS_FLUXO` em tempo de
render, então ela passa a exibir as quatro posições sem alteração de código.

---

## Task 1: O tipo do documento no template

**Files:**
- Modify: `src/lib/whatsapp/tipos.ts`

- [ ] **Step 1: Estender `TemplateEnvio`**

```ts
// O documento do CABEÇALHO do template (header de mídia). O arquivo vai em base64 e o
// upload/media id é problema do adaptador — a política não conhece esse conceito.
export type DocumentoTemplate = { base64: string; mime: string; nome: string };

export type TemplateEnvio = {
  nome: string;
  idioma: string;
  params: string[];
  documento?: DocumentoTemplate;
};
```

`ProvedorWhatsapp` não muda: `enviarTemplate` continua opcional, e quem o implementa passa a aceitar
o campo novo.

- [ ] **Step 2: Verificar** — `npm run typecheck`

---

## Task 2: Header de documento no adaptador oficial

**Files:**
- Modify: `src/lib/whatsapp/oficial.ts`

- [ ] **Step 1: Extrair o upload**

O `enviarMidia` já faz `POST /{phone_number_id}/media` e lê o `id`. Extrair esse trecho para
`uploadMidiaOficial(cfg, { base64, mime, nome })` devolvendo `{ id }` ou `{ erro, resposta }`, e fazer
`enviarMidia` usá-la — sem mudar o comportamento dele.

- [ ] **Step 2: Montar o componente `header`**

`montarEnvioTemplateOficial` passa a receber o media id já resolvido (mantendo a função **pura**, como
as irmãs `montarEnvioTextoOficial`/`montarEnvioMidiaOficial`):

```ts
export function montarEnvioTemplateOficial(
  cfg: OficialConfig,
  telefone: string,
  t: TemplateEnvio,
  mediaId?: string,
): { url: string; headers: Record<string, string>; body: string }
```

Os componentes saem **nesta ordem** — a Meta rejeita `body` antes de `header`:

```jsonc
"components": [
  { "type": "header", "parameters": [
      { "type": "document", "document": { "id": "<mediaId>", "filename": "<t.documento.nome>" } } ] },
  { "type": "body", "parameters": [ { "type": "text", "text": "<p1>" }, … ] }
]
```

O `header` só é emitido quando há `t.documento` **e** `mediaId`; o `body`, só quando há params. Um
template sem nenhum dos dois continua saindo sem `components`, como hoje.

- [ ] **Step 3: `enviarTemplate` faz o upload antes**

Quando `t.documento` existe, `enviarTemplate` chama `uploadMidiaOficial` primeiro e usa o id
resultante. Falha de upload devolve `{ ok: false, erro }` sem tentar o envio — o mesmo formato de erro
que o resto do adaptador usa.

- [ ] **Step 4: Verificar** — `npx vitest run src/tests/whatsapp/oficial.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/tipos.ts src/lib/whatsapp/oficial.ts
git commit -m "feat(whatsapp): template com cabecalho de documento na API oficial"
```

---

## Task 3: A camada proativa roteia mídia

**Files:**
- Modify: `src/lib/whatsapp/politica-proativo.ts` (só o contrato de params do `nfse`)
- Modify: `src/lib/whatsapp/proativo.ts`

- [ ] **Step 1: Quatro posições no `nfse`**

```ts
nfse: ["cliente", "competencia", "valor", "vencimento"],
```

- [ ] **Step 2: `MensagemProativa` ganha `midia`**

```ts
export type MensagemProativa = {
  fluxo: FluxoProativo;
  texto: string;
  params: string[];
  // Opcional: só a NFS-e envia arquivo. No modo texto vira mídia com caption (o envio de
  // sempre); no modo template vira o cabeçalho de documento.
  midia?: MidiaEnvio;
};
```

- [ ] **Step 3: Rotear nos dois modos**

```ts
if (decisao.modo === "texto") {
  return msg.midia ? adaptador.enviarMidia(telefone, msg.midia) : adaptador.enviarTexto(telefone, msg.texto);
}
if (decisao.modo === "template" && tpl && adaptador.enviarTemplate) {
  return adaptador.enviarTemplate(telefone, {
    nome: tpl.nome,
    idioma: tpl.idioma,
    params: msg.params,
    documento: msg.midia
      ? { base64: msg.midia.base64, mime: msg.midia.mime, nome: msg.midia.nome }
      : undefined,
  });
}
```

O caminho de falha (sem template configurado → `evento_erro` + `{ ok: false }`) não muda.

- [ ] **Step 4: Verificar** — `npx vitest run src/tests/whatsapp/`

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/politica-proativo.ts src/lib/whatsapp/proativo.ts
git commit -m "feat(whatsapp): camada proativa roteia midia (caption x cabecalho de template)"
```

---

## Task 4: NFS-e em lote pela camada

**Files:**
- Modify: `src/app/(app)/nfse/lote/envio.ts`

- [ ] **Step 1: Trocar o envio**

Sai `adaptadorWhatsappAtivo` + `ativo.adaptador.enviarMidia`; entra `enviarProativo`:

```ts
const r = await enviarProativo(tel, {
  fluxo: "nfse",
  texto,
  // A ORDEM é o contrato de PARAMS_FLUXO.nfse: cliente, competência, valor, vencimento.
  params: [
    (cl?.responsavel_nome as string | null) || razaoSocial,
    competenciaBR(String(nota.competencia)),
    valorBR(Number(nota.valor)),
    vencimento,
  ],
  midia: { tipo: "document", base64: pdfR.pdfBase64, mime: "application/pdf", nome: nomeArq, caption: texto },
});
```

A checagem de provedor ausente que hoje acontece cedo (`if ("erro" in ativo) return …`) passa a vir do
resultado: a mensagem de erro continua chegando ao operador pela mesma `ResultadoEnvioNota`. Manter a
ordem atual das validações baratas (sem cobrança WhatsApp, sem telefone) **antes** de gerar o PDF.

- [ ] **Step 2: Verificar** — `npm run typecheck && npx vitest run src/tests/nfse/ src/tests/whatsapp/`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/nfse/lote/envio.ts"
git commit -m "feat(whatsapp): NFS-e em lote passa pela camada proativa"
```

---

## Task 5: Testes

**Files:**
- Modify: `src/tests/whatsapp/oficial.test.ts` (montagem do payload)
- Create: `src/tests/whatsapp/nfse-proativo.test.ts` (roteamento na camada)

- [ ] **Step 1: Payload do template com documento**

Sobre `montarEnvioTemplateOficial`, sem rede:

1. Com `documento` + mediaId: `components[0].type === "header"`, com
   `parameters[0].document.id` e `.filename`; `components[1].type === "body"` com os quatro params na
   ordem. A ordem header-antes-de-body é o que a Meta exige — o teste a fixa.
2. Sem `documento`: nenhum `header` (não regride os cinco fluxos das fatias 3A/3B).
3. Com `documento` mas **sem** mediaId: nenhum `header` — não se manda referência de arquivo vazia.

- [ ] **Step 2: Roteamento da mídia na camada**

Reusando o mock de Supabase/adaptador de `proativo.test.ts`:

1. **Z-API + `midia`:** chama `enviarMidia` com o objeto **idêntico** ao passado (caption inclusa) e
   **não** chama `enviarTexto` nem `enviarTemplate`. Não-regressão.
2. **Oficial + `midia` + template configurado:** chama `enviarTemplate` com `documento` derivado da
   mídia e os params na ordem; `enviarMidia` não é chamado.
3. **Oficial + `midia` sem template configurado:** nada é enviado, resultado `{ ok: false }` e uma
   linha em `evento_erro` — o lote segue nas demais notas.
4. **Contrato:** `PARAMS_FLUXO.nfse` é exatamente `["cliente","competencia","valor","vencimento"]`.

- [ ] **Step 3: Verificar** — `npx vitest run src/tests/whatsapp/`

- [ ] **Step 4: Commit**

```bash
git add src/tests/whatsapp/oficial.test.ts src/tests/whatsapp/nfse-proativo.test.ts
git commit -m "test(whatsapp): cabecalho de documento no template e roteamento de midia"
```

---

## Task 6: Release

- [ ] **Step 1: Suíte completa** — `npm run lint && npm run typecheck && npm test && npm run format && npm run build`

- [ ] **Step 2: Versão + CHANGELOG** no mesmo PR (minor: `6.78.0`), registrando o fechamento do
  Sub-projeto 3 (os seis fluxos proativos com paridade entre provedores) e a mudança do contrato de
  params do `nfse`.

- [ ] **Step 3: Entrega** — PR `develop`→`main`, `gh pr checks --watch`, merge. Sem migration.
  Implantar no EasyPanel, conferir `/api/health`, **tag depois**.

---

## Self-Review

- **Cobertura da spec (3C):** NFS-e em lote com template de cabeçalho de mídia e forma de payload
  própria (Tasks 2 e 3), fluxo ligado (Task 4), testes de payload e roteamento (Task 5).
- **Fecha o sub-projeto:** depois desta fatia, os seis fluxos proativos passam por `proativo.ts` e
  nenhum chama o adaptador direto.
- **Não-regressão da Z-API:** teste dedicado (Task 5, caso 1 do roteamento) mais a suíte existente de
  `notas-envio`.
- **Pureza preservada:** `montarEnvioTemplateOficial` continua pura recebendo o media id pronto; o
  efeito (upload) fica no `enviarTemplate`, como já era no `enviarMidia`.

## Riscos

| Risco | Mitigação |
|---|---|
| Template aprovado sem header de documento → a Meta recusa o envio | O erro da API vira falha de envio registrada, como já acontece com template pendente/reprovado. A tela de config mostra o status ao vivo. |
| Upload do PDF falhar (arquivo grande, timeout) | `enviarTemplate` devolve o erro do upload sem tentar o envio; a nota conta como erro e o lote segue. |
| Ordem `header`/`body` invertida no payload | Fixada por teste (Task 5, caso 1). |
