# WhatsApp oficial — Fatia 3B: os quatro fluxos de texto — Implementation Plan

**Goal:** fazer os quatro fluxos proativos de texto que ainda falam direto com o adaptador —
**cobrança manual**, **legalização**, **follow-up de proposta** e **comunicados em massa** — passarem
pela camada `enviarProativo` / `criarEnviadorProativo` construída na 3A. Depois desta fatia, o único
envio proativo fora da camada é o de NFS-e em lote (fica para a 3C, que precisa de template com
cabeçalho de documento).

**Architecture:** nada novo. A camada `lib/whatsapp/proativo.ts` já decide texto × template pela
capacidade do provedor. Cada fluxo troca `adaptador.enviarTexto(tel, texto)` por
`enviar(tel, { fluxo, texto, params })`, respeitando a ordem de `PARAMS_FLUXO`. Quem envia em lote
(follow-up, comunicados) resolve o enviador **uma vez** com `criarEnviadorProativo()`; quem dispara
único (cobrança manual, legalização) usa `enviarProativo()`.

**Tech Stack:** Next 16 (server actions), TypeScript, Supabase, vitest.

## Global Constraints

- **Z-API é opção permanente.** Em nenhum dos quatro fluxos o texto enviado pela Z-API pode mudar —
  `decidirEnvio` devolve `texto` quando `exigeTemplateForaDaJanela` é falso, e `params` é ignorado.
  Isso é requisito de verificação, não nota de rodapé.
- **Sem migration.** A `whatsapp_template_fluxo` da 3A já aceita os seis fluxos (chave `fluxo` livre).
- **Sem mudança de contrato de parâmetros.** `PARAMS_FLUXO` já está publicado na tela de configuração
  da 3A e o escritório pode já ter cadastrado templates na Meta com essa ordem. Nenhum fluxo pode
  reordenar ou acrescentar posições aqui.
- Persistência de histórico (`whatsapp_mensagem`, `comunicado_destinatario`, `followup_envio`,
  `legalizacao_etapa.cliente_avisado_em`) **não muda** — a falha por template ausente já cai no
  caminho de erro que cada fluxo tem hoje.
- Rodar antes de entregar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Limitação consciente (cobrança manual)

Hoje a cobrança manual anexa ao texto **linha digitável** e **PIX copia-e-cola** do boleto, quando
existe. `PARAMS_FLUXO.cobranca_manual` tem três posições (cliente, valor, vencimento) e não carrega
esses dados. Consequência: no provedor oficial, **fora** da janela de 24h, a mensagem sai como
template sem os dados de pagamento. Dentro da janela (o caso comum — cobrança manual costuma ser
disparada em conversa viva) o texto livre completo continua indo, idêntico a hoje.

Não se resolve nesta fatia: acrescentar posições mudaria um contrato já publicado, e template com
linha digitável tem regra própria de aprovação na Meta. Fica registrado como decisão, não como
esquecimento.

---

## Task 1: Cobrança manual pela camada

**Files:**
- Modify: `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts`

- [ ] **Step 1: Trocar o envio**

Remover o import de `adaptadorWhatsappAtivo` e usar `enviarProativo`. O bloco de resolução do
adaptador (`const ativo = await adaptadorWhatsappAtivo(); if ("erro" in ativo) …`) vira uma chamada
só; `ResultadoEnvio` já traz `ok`, `erro` e `resposta`.

```ts
const r = await enviarProativo(tel, {
  fluxo: "cobranca_manual",
  texto: textoFinal,
  // ORDEM: PARAMS_FLUXO.cobranca_manual = cliente, valor, vencimento.
  params: [cliente?.razao_social ?? "", formatarMoeda(Number(t.valor)), formatarData(t.vencimento as string)],
});
```

O insert em `whatsapp_mensagem` continua gravando `texto` (o texto livre) e `status` derivado de
`r.ok` — inclusive em erro, para diagnóstico.

- [ ] **Step 2: Verificar** — `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/financeiro/contas-a-receber/whatsapp.ts"
git commit -m "feat(whatsapp): cobranca manual passa pela camada proativa"
```

---

## Task 2: Legalização pela camada

**Files:**
- Modify: `src/app/(app)/legalizacao/actions.ts`

- [ ] **Step 1: Trocar o envio em `avisarClienteEtapa`**

O ramo `canal === "whatsapp"` hoje resolve o adaptador e chama `enviarTexto(tel, corpo)`. Passa a:

```ts
const r = await enviarProativo(tel, {
  fluxo: "legalizacao",
  texto: corpo,
  // ORDEM: PARAMS_FLUXO.legalizacao = cliente, etapa, processo, data.
  params: [vars.cliente, vars.etapa, vars.processo, vars.data],
});
ok = r.ok;
```

A checagem "WhatsApp não está configurado" continua existindo: `enviarProativo` devolve
`{ ok: false, erro }` quando não há provedor, e o `if (!ok) return "Etapa concluída, mas o aviso ao
cliente falhou no envio."` já cobre. A validação de telefone vazio permanece **antes** da chamada.

- [ ] **Step 2: Verificar** — `npm run typecheck && npx vitest run src/tests/legalizacao/`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/legalizacao/actions.ts"
git commit -m "feat(whatsapp): aviso de legalizacao passa pela camada proativa"
```

---

## Task 3: Follow-up de proposta pela camada

**Files:**
- Modify: `src/lib/comercial/followup-motor.ts`

- [ ] **Step 1: Resolver o enviador uma vez**

Trocar `adaptadorWa: ProvedorWhatsapp | null` por `enviadorWa: Enviador | null`, resolvido com
`criarEnviadorProativo()` no mesmo ponto — mantendo a semântica atual de
`return { ...base, ativo, motivo: "WhatsApp não configurado." }` quando falha. O import de
`ProvedorWhatsapp` sai se ficar sem uso.

- [ ] **Step 2: Trocar o envio no laço**

```ts
const r = await enviadorWa!.enviar(tel, {
  fluxo: "followup",
  texto: corpo,
  // ORDEM: PARAMS_FLUXO.followup = cliente, proposta.
  params: [vars.prospect, vars.numero],
});
ok = r.ok;
```

O insert em `followup_envio` (`enviado`/`falhou`/`sem_destino`) e a contagem do resumo não mudam —
um fluxo sem template configurado conta como `falhou` e o lote segue nas demais propostas.

- [ ] **Step 3: Verificar** — `npm run typecheck && npx vitest run src/tests/comercial/`

- [ ] **Step 4: Commit**

```bash
git add src/lib/comercial/followup-motor.ts
git commit -m "feat(whatsapp): followup de proposta passa pela camada proativa"
```

---

## Task 4: Comunicados em massa pela camada (envio e reenvio)

**Files:**
- Modify: `src/app/(app)/comunicados/actions.ts`

- [ ] **Step 1: Envio (`enviarComunicado`)**

Trocar a resolução do adaptador por `criarEnviadorProativo()`, mantendo o retorno
`{ erro: "WhatsApp não configurado." }`. No laço:

```ts
const r = await enviadorWa.enviar(tel, {
  fluxo: "comunicado",
  texto: aplicarTemplate(corpo, vars),
  // ORDEM: PARAMS_FLUXO.comunicado = cliente, titulo.
  params: [vars.nome, titulo],
});
```

`vars.nome` é a razão social (vem de `variaveisDoCliente`); `titulo` é o título interno do
comunicado, já validado no início da action.

- [ ] **Step 2: Reenvio das falhas (`reenviarFalhas`)**

O `select` do comunicado passa a trazer `titulo` além de `assunto, corpo, canal` — o segundo
parâmetro do template precisa dele. Mesma troca de adaptador por enviador e mesmo formato de
`params`.

- [ ] **Step 3: Verificar** — `npm run typecheck && npx vitest run src/tests/comunicados/`

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/comunicados/actions.ts"
git commit -m "feat(whatsapp): comunicados em massa passam pela camada proativa"
```

---

## Task 5: Testes dos quatro fluxos

**Files:**
- Create: `src/tests/whatsapp/fluxos-proativos.test.ts`

- [ ] **Step 1: Escrever os casos**

Testando `decidirEnvio` + o contrato de `params` de cada fluxo sem depender do Supabase real:

1. **Não-regressão Z-API (requisito da spec):** com `exigeTemplateForaDaJanela: false`, os quatro
   fluxos decidem `texto` — em qualquer estado de janela e com ou sem template cadastrado.
2. **Oficial, fluxo `comunicado` (`sempre_template`):** com template → `template`; sem template →
   `falha`, mesmo com o cliente tendo falado há 1 minuto (a janela não salva um fluxo em lote).
3. **Oficial, fluxos de janela (`cobranca_manual`, `legalizacao`, `followup`):** dentro da janela →
   `texto`; fora da janela e com template → `template`; fora e sem template → `falha`.
4. **Contrato de posições:** `PARAMS_FLUXO` dos quatro fluxos tem exatamente os nomes e a ordem que
   os call-sites montam — o teste fixa a ordem para que reordenar em qualquer um dos lados quebre.

- [ ] **Step 2: Verificar** — `npx vitest run src/tests/whatsapp/`

- [ ] **Step 3: Commit**

```bash
git add src/tests/whatsapp/fluxos-proativos.test.ts
git commit -m "test(whatsapp): fluxos proativos decidem texto x template e respeitam a ordem dos params"
```

---

## Task 6: Release

- [ ] **Step 1: Suíte completa** — `npm run lint && npm run typecheck && npm test && npm run format && npm run build`

- [ ] **Step 2: Versão + CHANGELOG** no mesmo PR (minor: `6.77.0`), deixando explícito que é paridade
  entre provedores — a Z-API segue igual — e que a NFS-e em lote fica para a 3C.

- [ ] **Step 3: Entrega** — PR `develop`→`main`, `gh pr checks --watch`, merge. Sem migration nesta
  fatia. Implantar no EasyPanel, conferir `/api/health`, **tag depois**.

---

## Self-Review

- **Cobertura da spec (3B):** os quatro fluxos de texto listados na tabela de fatias — cobrança
  manual (Task 1), legalização (Task 2), follow-up (Task 3), comunicados (Task 4, nos dois pontos de
  envio). NFS-e em lote fica de fora por design (3C).
- **Não-regressão da Z-API:** exigida por teste próprio (Task 5, caso 1) e pelas suítes existentes
  de cada fluxo, que continuam verdes porque o texto livre é o mesmo objeto que hoje.
- **Enviador resolvido uma vez em lote:** follow-up e comunicados usam `criarEnviadorProativo()`
  fora do laço, como a régua faz desde a 3A — evita N leituras de config e N decifragens.
- **Riscos conhecidos:** a limitação da cobrança manual (dados de boleto fora do template) está
  documentada acima em vez de resolvida por mudança de contrato.
