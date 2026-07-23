# WhatsApp oficial — Sub-projeto 3: templates (HSM) (design)

## Objetivo

Dar **paridade de recursos** entre os dois provedores de WhatsApp. Hoje, um escritório que escolhe a
**API oficial (Meta Cloud API)** perde os envios **proativos fora da janela de 24h** — régua de cobrança,
avisos, comunicados — que na **Z-API** funcionam como texto livre. Este sub-projeto entrega o envio por
**template aprovado**, para que a escolha de provedor não custe funcionalidade.

**Isto não é migração.** Z-API e API oficial são **duas opções permanentes**; cada escritório escolhe a
sua (`whatsapp_config.provedor`, UI desde a v6.72.0). Nada aqui deprecia ou desliga a Z-API — ao
contrário, a não-regressão do caminho Z-API é requisito explícito de verificação.

## Contexto (do que existe)

- **Adaptador por provedor** (`ProvedorWhatsapp` em `src/lib/whatsapp/tipos.ts`): `enviarTexto`,
  `enviarMidia`, `statusConexao`. Implementações em `zapi.ts` e `oficial.ts`; `ativo.ts`
  (`adaptadorWhatsappAtivo`) resolve qual usar a partir da config e devolve `{ adaptador, provedor }`.
- **Todos os envios já passam por `adaptadorWhatsappAtivo`** — não há mais chamada direta à Z-API fora
  de `ativo.ts`. O ponto de extensão é único.
- **Os 6 fluxos proativos** (o Atendimento não entra: é resposta dentro da conversa, sempre na janela):

  | Fluxo | Arquivo |
  |---|---|
  | Régua de cobrança | `src/lib/whatsapp/regua-motor.ts` |
  | Cobrança manual | `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts` |
  | Comunicados em massa | `src/app/(app)/comunicados/actions.ts` |
  | Avisos de legalização | `src/app/(app)/legalizacao/actions.ts` |
  | Follow-up de proposta | `src/lib/comercial/followup-motor.ts` |
  | NFS-e em lote (com mídia) | `src/app/(app)/nfse/lote/envio.ts` |

- **Composição hoje:** cada fluxo renderiza **texto livre** com variáveis (ex.: a régua guarda `template`
  por etapa e faz `aplicarTemplate(etapa.template, vars)`) e chama `enviarTexto`.
- **Mensagens recebidas** ficam em `whatsapp_mensagem` (`direcao='IN'`, com data) — é a fonte para saber
  se estamos dentro da janela de 24h.
- **Registro de erro** existe: tabela `evento_erro` (`0129`) + painel Configurações → Observabilidade
  (admin), da v6.69.
- **Config** `whatsapp_config`: `provedor`, `oficial_phone_number_id`, `oficial_token_cifrado`,
  `oficial_app_secret_cifrado`, `oficial_verify_token`. Segredos via `cifrarDominio/decifrarDominio("whatsapp", …)`.

## A regra da Meta (o que muda)

- Dentro de **24h** da última mensagem **do cliente**, a empresa envia **texto livre** (e não é cobrado
  como conversa de template).
- Fora da janela, só **template aprovado** (HSM): nome + idioma + **parâmetros posicionais**
  (`{{1}}`, `{{2}}`…). O corpo do texto é **fixo pela aprovação** — nós só preenchemos parâmetros.
- A aprovação acontece no **Business Manager da Meta**, fora do SALDO, com prazo e possibilidade de
  reprovação.
- Listagem dos templates da conta: `GET /{waba_id}/message_templates` (campos `name`, `language`,
  `status`), com token que tenha permissão de **gestão**.

## Decisões (do brainstorm)

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo | **Os 6 fluxos proativos** | Paridade é o princípio: o escritório escolhe o provedor sem perder recurso. |
| Política da janela | **Por fluxo, FIXA no código** (não configurável) | Evita 6 interruptores de efeito sutil; nós documentamos o comportamento certo de cada fluxo. |
| Config de template | **Seletor alimentado pela Meta** (WABA ID + listagem com status) | O ganho não é digitar menos: é **ver o status de aprovação dentro do SALDO**, antes de o envio falhar. |
| Ordem de parâmetros | **Fixa por fluxo, no código, exibida na tela** | Dispensa mapeamento configurável e mata o erro silencioso (parâmetro certo na posição errada não falha — chega torto no cliente). |
| Sem template disponível | **Não envia; registra e avisa a equipe** | Sem canal-surpresa. O contrapeso é a tela expor o estado dos templates **antes** do envio. |
| Z-API | **Intocada** | Requisito de não-regressão. |

### Política por fluxo (fixa)

| Fluxo | Política | Por quê |
|---|---|---|
| Régua de cobrança · Comunicados · NFS-e em lote | **sempre template** | Disparam sem conversa em curso; a janela quase nunca vale. |
| Cobrança manual · Legalização · Follow-up | **usa a janela quando houver** | Costumam ocorrer com conversa viva — texto livre, gratuito e idêntico à Z-API. |

## Arquitetura

### O princípio: os fluxos não sabem o que é um template

Se cada um dos 6 chamadores tiver `if (provedor === "oficial")`, a paridade vira seis divergências para
manter. A política mora **num lugar só** — uma camada acima do adaptador.

**Camada de política — `src/lib/whatsapp/proativo.ts`:**

```ts
export type FluxoProativo =
  | "regua" | "cobranca_manual" | "legalizacao" | "comunicado" | "followup" | "nfse";

export type MensagemProativa = {
  fluxo: FluxoProativo;
  texto: string;      // o texto livre já renderizado (o que a Z-API sempre enviou)
  params: string[];   // os parâmetros posicionais, na ordem fixa do fluxo
};

export async function enviarProativo(
  telefone: string,
  msg: MensagemProativa,
): Promise<ResultadoEnvio>;
```

Os chamadores trocam `adaptador.enviarTexto(tel, texto)` por `enviarProativo(tel, { fluxo, texto, params })`
e **não decidem nada**. Passam as duas formas; a camada escolhe. Na Z-API, `params` é ignorado e o texto
segue idêntico ao de hoje.

`enviarProativo` resolve o adaptador (`adaptadorWhatsappAtivo`), consulta a janela, consulta o template do
fluxo, chama `decidirEnvio` e executa — `enviarTexto` ou `enviarTemplate`.

### A interface ganha capacidade, não um `if`

```ts
export type TemplateEnvio = { nome: string; idioma: string; params: string[] };

export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
  exigeTemplateForaDaJanela: boolean;                    // false na Z-API, true na oficial
  enviarTemplate?(telefone: string, t: TemplateEnvio): Promise<ResultadoEnvio>;
}
```

A política pergunta pela **capacidade**, não pelo nome do provedor — um terceiro provedor no futuro se
declara e a camada não muda. `criarAdaptadorZapi` passa a devolver `exigeTemplateForaDaJanela: false`
(sem `enviarTemplate`); `criarAdaptadorOficial`, `true` + a implementação.

**`enviarTemplate` na oficial** — `POST /{phone_number_id}/messages`:

```jsonc
{ "messaging_product": "whatsapp", "to": "<tel>", "type": "template",
  "template": { "name": "<nome>", "language": { "code": "<idioma>" },
    "components": [{ "type": "body",
      "parameters": [{ "type": "text", "text": "<p1>" }, { "type": "text", "text": "<p2>" }] }] } }
```

### A decisão, isolada e pura — `src/lib/whatsapp/politica-proativo.ts`

```ts
export type PoliticaFluxo = "sempre_template" | "janela";

export const POLITICA: Record<FluxoProativo, PoliticaFluxo> = {
  regua: "sempre_template", comunicado: "sempre_template", nfse: "sempre_template",
  cobranca_manual: "janela", legalizacao: "janela", followup: "janela",
};

// A ordem dos parâmetros de cada fluxo. É contrato: aparece na tela de config para o
// escritório escrever o template na Meta na mesma ordem.
export const PARAMS_FLUXO: Record<FluxoProativo, string[]> = {
  regua:           ["cliente", "valor", "vencimento"],
  cobranca_manual: ["cliente", "valor", "vencimento"],
  legalizacao:     ["cliente", "etapa", "processo", "data"],
  comunicado:      ["cliente", "titulo"],
  followup:        ["cliente", "proposta"],
  nfse:            ["cliente", "competencia"],
};

export type Modo = { modo: "texto" } | { modo: "template" } | { modo: "falha"; motivo: string };

export function decidirEnvio(e: {
  politica: PoliticaFluxo;
  exigeTemplate: boolean;   // capacidade do provedor
  dentroDaJanela: boolean;
  temTemplate: boolean;     // há template CONFIGURADO para o fluxo (ver nota sobre aprovação)
}): Modo;
```

Regras: provedor que **não** exige template → sempre `texto` (é o caminho Z-API, inalterado). Exigindo:
política `janela` **e** dentro da janela → `texto`; senão, `temTemplate` → `template`, e sem template →
`falha` com motivo legível.

**Configurado ≠ aprovado — e os dois casos falham por caminhos diferentes.** No momento do envio, o
sistema só conhece o que está em `whatsapp_template_fluxo`; o status de aprovação é da Meta e pode mudar
a qualquer momento. Então:

- **Não configurado** → detectado localmente: `decidirEnvio` devolve `falha` e nada é enviado.
- **Configurado mas pendente/reprovado** → só a Meta sabe: o envio é tentado e a **API responde erro**,
  tratado como falha de envio (mesmo registro, mesma visibilidade).

É por isso que a tela de config busca o status **ao vivo**: ela é a única forma de ver "pendente" ou
"reprovado" antes de o envio falhar. Nenhum status de aprovação é copiado para o banco — copiá-lo criaria
uma segunda verdade que envelhece em silêncio.

E a janela:

```ts
export function dentroDaJanela(ultimaEntradaEm: string | null, agora: string): boolean; // 24h
```

### Modelo de dados (migration `0132`)

```sql
alter table whatsapp_config add column if not exists oficial_waba_id text;

create table if not exists whatsapp_template_fluxo (
  fluxo         text primary key,                    -- 'regua' | 'cobranca_manual' | ...
  nome          text not null,                       -- nome do template aprovado na Meta
  idioma        text not null default 'pt_BR',
  atualizado_em timestamptz not null default now()
);
```

Tabela em vez de 12 colunas na config: mais limpa e aberta a novos fluxos. RLS no padrão do projeto —
leitura para `admin/assistente/contador`, escrita só `admin`.

### As telas

`/configuracoes/whatsapp`, **aba oficial** (a seção não existe na Z-API — lá não há esse conceito):

- Campo **WABA ID** (texto, junto de Phone Number ID e token).
- Seção **Templates por fluxo**: uma linha por fluxo com um **seletor** alimentado por
  `GET /{waba_id}/message_templates` (nome + idioma + **status**), o **contrato de parâmetros** daquele
  fluxo em texto (ex.: *"régua: `{{1}}` cliente · `{{2}}` valor · `{{3}}` vencimento"*), e o estado:
  **aprovado**, **pendente**, **reprovado** ou **não configurado**.
- Se a listagem falhar (token sem permissão de gestão), a tela diz isso e permite **digitar o nome à
  mão** — a config não fica refém da permissão.

Esta tela é o "avisa a equipe" que age **antes** do envio: um template pendente aparece ali, não como
cliente sem aviso três dias depois.

### Falha

- **Envio manual** (cobrança na tela): a action devolve o erro; o operador vê na hora.
- **Envio automático** (régua, follow-up, legalização, comunicados): não envia e registra em
  `evento_erro` com `contexto` identificando fluxo e cliente (painel Observabilidade, admin). **O cron não
  quebra** — um fluxo sem template não pode derrubar os demais envios do lote.

## Fatias de implementação

| Fatia | Entrega | Migration |
|---|---|---|
| **3A** | Fundação: `0132`, `decidirEnvio`/`dentroDaJanela`/`POLITICA`/`PARAMS_FLUXO`, `exigeTemplateForaDaJanela` nos dois adaptadores, `enviarTemplate` na oficial, `enviarProativo`, listagem da Meta + tela, e **a régua ligada** | sim (`0132`) |
| **3B** | Os quatro fluxos de texto: cobrança manual, legalização, follow-up, comunicados | — |
| **3C** | NFS-e em lote — **template com documento anexo** (cabeçalho de mídia), forma de payload própria | — |

A **3C** é separada de propósito: template com cabeçalho de documento não é "mais um fluxo", é outro
formato — misturá-lo na 3B esconderia trabalho real.

## Verificação

- **Puros:** `decidirEnvio` nas combinações de política × capacidade × janela × template (incl. o caminho
  Z-API sempre `texto`); `dentroDaJanela` no limite exato de 24h; parsing da listagem de templates da Meta
  (aprovado/pendente/reprovado, lista vazia, resposta de erro).
- **Não-regressão da Z-API (requisito):** os 6 fluxos passam a chamar `enviarProativo`; a suíte prova que,
  com provedor Z-API, o texto enviado é **idêntico** ao de hoje e `params` não interfere.
- **Render:** a seção de templates com os quatro estados e o contrato de parâmetros; ausência da seção na
  aba Z-API.
- **Falha:** **sem template configurado**, o envio automático nem tenta e registra em `evento_erro`;
  **template pendente/reprovado** vira erro da Meta no envio, registrado do mesmo jeito; envio manual
  devolve erro ao operador. Em ambos os casos o lote continua nos demais clientes.
- **Sempre:** `lint`, `typecheck`, `test`, `format:check`, `build`; migration idempotente e aplicada em
  produção antes do deploy.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Criar/submeter templates à Meta pelo SALDO | A aprovação é trabalho no Business Manager, com prazo e possível reprovação. |
| Templates com botões/CTA (quick reply, URL) | Só corpo com parâmetros de texto nesta rodada. |
| Qualquer mudança de comportamento na Z-API | Ela é opção permanente e está em produção. |
| Política da janela configurável pelo escritório | Decidido: fixa no código, por fluxo. |
| Mapeamento configurável de variáveis → posições | Decidido: ordem fixa e documentada (evita erro silencioso). |

## Riscos

| Risco | Mitigação |
|---|---|
| O token atual pode não ter `whatsapp_business_management` para listar templates | A tela trata a falha com mensagem explícita e permite digitar o nome à mão. |
| Texto do template na Meta divergir do contrato de parâmetros | O contrato aparece ao lado do seletor; a mensagem enviada fica registrada em `whatsapp_mensagem`, como hoje. |
| Régua sem template = cliente não cobrado | Estado visível na tela de config + registro em `evento_erro`; o canal e-mail da régua segue normal. |
| A troca dos 6 chamadores para `enviarProativo` regredir a Z-API | É o requisito de verificação acima; a 3A converte **um** fluxo (régua), provando o caminho antes de mexer nos outros cinco. |
| Idioma do template (`pt_BR` × `pt`) não bater com o aprovado | O idioma vem do seletor (valor da própria Meta), não digitado. |
