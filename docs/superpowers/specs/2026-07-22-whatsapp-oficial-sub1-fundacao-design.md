# WhatsApp oficial — Sub-projeto 1: fundação + escolha + envio oficial (design)

## Objetivo

Deixar a plataforma pronta para o WhatsApp **como opção por escritório**: uma abstração de provedor
(`ProvedorWhatsapp`), a Z-API virando adaptador, um campo `provedor` na config, e um adaptador da
**API oficial (Cloud API da Meta)** fazendo envio de texto e status. Após este sub-projeto, o
escritório **pode escolher** o provedor e a oficial **envia texto** (dentro da janela de 24h). Inbound
oficial e templates/HSM são os Sub-projetos 2 e 3.

## Contexto (do que existe)

- **Z-API isolado em `src/lib/whatsapp/zapi.ts`:** `enviarTexto(cfg, tel, txt)`, `enviarMidiaZapi(cfg,
  tel, midia)`, `statusConexao(cfg)`, e os `montar*` puros. `ZapiConfig = { instance, token,
  clientToken }`. `MidiaEnvio = { tipo, base64, mime, nome, caption }`.
- **Config `whatsapp_config`** (singleton id=1; migration 0038): `instance`, `token_cifrado`,
  `client_token_cifrado`. RLS admin. Cifragem via `cifrarDominio("whatsapp", buf)` /
  `decifrarDominio("whatsapp", cif)`. `carregarConfigZapi()` decifra e devolve `ZapiConfig`.
- **8 chamadores** de envio hoje passam a `cfg` explícita:
  `legalizacao/actions.ts`, `comunicados/actions.ts`, `nfse/lote/envio.ts`,
  `financeiro/contas-a-receber/whatsapp.ts`, `atendimento/actions.ts`,
  `configuracoes/whatsapp/actions.ts`, `lib/comercial/followup-motor.ts`, `lib/whatsapp/regua-motor.ts`.
- **Molde do resolvedor:** `src/lib/boleto/ativo.ts` → `adaptadorAtivo()` devolve
  `{ adaptador, provedor } | { erro }`, lê a config por `createAdminSupabase`, decifra credenciais.
  Espelhar para WhatsApp.
- **Config UI:** `configuracoes/whatsapp/{page,Formularios,actions}.tsx` (gate `podeConfigurarWhatsapp`).

## API oficial (Cloud API) — o que muda

- **Envio de texto:** `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`, header
  `Authorization: Bearer {token}`, corpo `{ messaging_product:"whatsapp", to, type:"text", text:{
  preview_url:false, body } }`.
- **Janela de 24h:** fora dela, a oficial recusa texto livre (erro de "re-engagement"); só templates
  aprovados passam. Por isso os **proativos** (régua/avisos/comunicados/NFS-e) só ficam plenos no
  **Sub-projeto 3**. Neste sub-projeto, o envio oficial de texto atende o caso **dentro** das 24h
  (respostas de atendimento). Um escritório **não deve ligar a oficial de verdade** antes dos
  Sub-projetos 2 e 3.
- **Status:** a oficial não tem "sessão conectada" como a Z-API; `statusConexao` valida as
  credenciais com um `GET https://graph.facebook.com/v21.0/{phone_number_id}` (Bearer). HTTP 200 →
  conectado; caso contrário, erro.

## Decisões (do brainstorm)

- **Canal oficial completo é a meta**, construída em 3 sub-projetos; este é o 1º.
- **Padrão de adaptador** (como boletos): interface `ProvedorWhatsapp` + resolvedor
  `adaptadorWhatsappAtivo()`.
- **Escolha por escritório** via `whatsapp_config.provedor` (`zapi` | `oficial`, default `zapi`).
- **Duas fatias:** 1A (refactor para adaptador, sem mudança visível) · 1B (adaptador oficial texto/
  status + UI de escolha). **Mídia na oficial fica para a fatia 1C** (precisa do upload de media
  IDs); até lá, o `enviarMidia` do adaptador oficial devolve erro claro.

## Fatia 1A — Adaptador (refactor sem mudança de comportamento)

### Interface + tipos — `src/lib/whatsapp/tipos.ts`

```ts
export type ResultadoEnvio = { ok: boolean; erro?: string; resposta?: unknown };
export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };
export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
}
```
(`MidiaEnvio` sai de `zapi.ts` para cá; `zapi.ts` passa a importar daqui.)

### Adaptador Z-API — `src/lib/whatsapp/zapi.ts`

`criarAdaptadorZapi(cfg: ZapiConfig): ProvedorWhatsapp` — objeto que fecha sobre `cfg` e delega às
funções existentes (`enviarTexto`/`enviarMidiaZapi`/`statusConexao`). Os `montar*` puros e as
funções atuais permanecem (reuso).

### Resolvedor — `src/lib/whatsapp/ativo.ts`

`adaptadorWhatsappAtivo(): Promise<{ adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string }>`
— lê `whatsapp_config` (via `createAdminSupabase`), decifra as credenciais do provedor selecionado e
devolve o adaptador; erros claros se faltar config. Molde de `boleto/ativo.ts`.

### Migration `0130_whatsapp_provedor.sql`

```sql
alter table whatsapp_config add column if not exists provedor text not null default 'zapi'
  check (provedor in ('zapi','oficial'));
alter table whatsapp_config add column if not exists oficial_phone_number_id text;
alter table whatsapp_config add column if not exists oficial_token_cifrado text;
```
(Aditiva; a RLS admin de `whatsapp_config` já cobre a escrita.)

### Refactor dos 8 chamadores

Onde hoje há `const cfg = await carregarConfigZapi(); … enviarTexto(cfg, tel, txt)`, passar a:
`const ativo = await adaptadorWhatsappAtivo(); if ("erro" in ativo) return/trata; await
ativo.adaptador.enviarTexto(tel, txt)`. Comportamento idêntico (provedor default `zapi`). `carregarConfigZapi`
continua existindo para o adaptador Z-API do resolvedor.

## Fatia 1B — Adaptador oficial + escolha na UI

### Adaptador oficial — `src/lib/whatsapp/oficial.ts`

- `OficialConfig = { phoneNumberId: string; token: string; versao?: string }` (default `v21.0`).
- Puro: `montarEnvioTextoOficial(cfg, telefone, texto): { url, headers, body }` — testável.
- `criarAdaptadorOficial(cfg): ProvedorWhatsapp`:
  - `enviarTexto` — usa o `montar*` + `fetch` com timeout (molde do Z-API), mapeia HTTP≠2xx para
    `{ ok:false, erro:"WhatsApp oficial HTTP <status>", resposta }`.
  - `statusConexao` — `GET .../{phone_number_id}` (Bearer); 200 → `{ conectado:true }`.
  - `enviarMidia` — **por ora** `{ ok:false, erro:"Envio de mídia pela API oficial ainda não disponível (em breve)." }` (implementado na fatia 1C).

### Resolvedor (completar)

`adaptadorWhatsappAtivo()` passa a montar `criarAdaptadorOficial` quando `provedor === 'oficial'`
(decifrando `oficial_token_cifrado`, exigindo `oficial_phone_number_id`).

### Config UI — `configuracoes/whatsapp`

- Seletor de **provedor** (`Z-API` × `API oficial`) que salva `provedor`.
- Campos condicionais: Z-API (instance/token/client-token, como hoje) × oficial (phone_number_id +
  token permanente). Salvar cifrando o token oficial (`cifrarDominio("whatsapp", …)`).
- Botão **"testar conexão"** que chama `statusConexao` do provedor selecionado.
- Título da página deixa de ser fixo "WhatsApp (Z-API)" → "WhatsApp".

## Testes

- **Puros:** `montarEnvioTextoOficial` (url/headers/body corretos, Bearer, corpo `type:text`);
  `criarAdaptadorZapi`/`criarAdaptadorOficial` retornam objeto que satisfaz a interface (compilação).
- **Resolvedor:** com mock não há harness — coberto por typecheck/build; o refactor dos 8 chamadores
  é coberto pela **suíte existente** (regua/notas/inbox/mensagem) + typecheck/build.
- **Render:** o novo formulário de config (seletor de provedor + campos condicionais).

## Fora de escopo (deste sub-projeto)

- **Inbound oficial** (Sub-projeto 2) e **templates/HSM** (Sub-projeto 3).
- **Mídia pela oficial** (fatia 1C — upload de media IDs); até lá, `enviarMidia` oficial devolve erro claro.
- Migração de dados: nenhuma (aditiva).

## Sequência de entrega

| Fatia | Entrega | Migration |
|---|---|---|
| 1A | Interface + adaptador Z-API + resolvedor + refactor dos 8 chamadores | sim (`0130`) |
| 1B | Adaptador oficial (texto/status) + UI de escolha | — |
| 1C | Mídia pela oficial (upload) | — |

Cada fatia é uma release; esta spec é a fonte comum e cada fatia ganha seu plano na hora de executar.
Sub-projetos 2 e 3 terão brainstorm/spec próprios.
