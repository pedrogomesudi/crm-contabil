# Atendimento — mídia como no WhatsApp — Design

**O que é:** os arquivos do Atendimento (imagem, áudio, documento) passam a **abrir rápido** (URL assinada,
direto do Storage) e a **aparecer como no WhatsApp** (miniatura, player, cartão, lightbox). É a segunda
das três melhorias funcionais do Atendimento (a 1ª, tempo real, já entregou; a 3ª é leitura de cadastro).

## O problema (medido)

**Velocidade.** Toda mídia passa por `/api/atendimento/midia/[id]` — a rota **baixa o arquivo do Storage
para o servidor e o reenvia** ao navegador, a cada abertura (`route.ts:36`, `admin.storage...download`).
Uma imagem trafega duas vezes (Storage→servidor→navegador). O projeto **já usa URL assinada**
(`createSignedUrl`) em documentos, legalização e obrigações — só o atendimento não, e por isso é o único
com o servidor no meio de todo arquivo.

**Aparência.** O componente `Midia` (`Inbox.tsx:617`) é cru: imagem em tamanho cheio (`max-h-64`), `<audio>`
nativo sem embrulho, documento como link de texto. Não há miniatura recortada, player estilizado, cartão
com ícone, nem visualizador sobreposto.

**O que já funciona (não mexer):** o webhook já **baixa e guarda** a mídia recebida no Storage privado
(`baixarEStorearMidia`, `route.ts:69`). O arquivo já está no banco; esta fatia é só **mostrá-lo bem**.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Como o navegador busca a mídia | **URL assinada, gerada junto com a conversa** (`abrirConversa` assina) | Tira o servidor do caminho; reusa o padrão de documentos/legalização; o Storage segue privado. |
| Validade da URL | **~10 min** | A conversa é recarregada com frequência (tempo real + polling de 30s), então a URL se renova sozinha. |
| Formatos | **Imagem (miniatura+lightbox), áudio (player), documento (cartão)** | O que o Pedro aprovou no mockup. |
| Player de áudio | **`<audio controls>` nativo, só o container estilizado** | Toca, faz seek e é acessível de graça — não reinventar. |
| Tamanho do arquivo no cartão | **Omitido** | Não está no schema; adicionar coluna + backfill é desproporcional ao ganho cosmético. |
| Ícone do documento | **Derivado do mime** (`application/pdf` → "PDF") | Sem coluna nova. |
| A rota-proxy `/api/atendimento/midia/[id]` | **Mantida como fallback de download** | O ⤓ do documento e o "baixar" do lightbox podem usá-la; não é mais o caminho de visualização. |

## Arquitetura

### O servidor — `abrirConversa` assina a URL

Em `src/app/(app)/atendimento/actions.ts`, a `abrirConversa` (e onde mais montar `MsgConversa` com mídia)
passa a, para cada mensagem com `midia_path`, gerar a URL assinada:

```ts
// para cada linha com midia_path, antes de retornar:
const { data: signed } = await admin.storage.from("documentos").createSignedUrl(m.midia_path, 600);
// → midiaUrl: signed?.signedUrl ?? null
```

> **Batch:** uma conversa pode ter várias mídias. Assinar uma a uma seria N chamadas. O supabase-js
> instalado (storage-js 2.108) tem **`createSignedUrls`** (plural, confirmado) que assina uma lista de
> paths numa chamada — o plano usa o plural. Se um path falhar, aquela mídia fica com `midiaUrl: null`
> (a UI cai no fallback do proxy), sem derrubar a conversa.
>
> **Qual client assina:** a `abrirConversa` lê as mensagens com `createServerSupabase` (RLS), mas a
> assinatura da URL usa o **`admin`** (`createAdminSupabase`). A policy de storage
> (`storage_documentos_select`, migration `0006`) só libera paths que existam na tabela `documentos` — e
> a mídia do atendimento vive no bucket `documentos` mas **não** tem linha lá (ela é referenciada por
> `whatsapp_mensagem.midia_path`). Então o client autenticado não conseguiria assiná-la; o `admin`
> assina. A autorização de quem vê a conversa **já** foi feita pela RLS na leitura das mensagens (o
> `gate()` + a policy `wa_msg_select`), então assinar com admin depois disso não abre brecha — só quem
> passou pela RLS chega aqui.

### `MsgConversa` ganha `midiaUrl`

`src/lib/whatsapp/inbox.ts`: `+ midiaUrl: string | null;`. Preenchido pelo `abrirConversa`; **`null`** quando
a mensagem vem por evento Realtime (o evento cru não tem URL — o refetch de ~1s a traz).

### `realtime.ts` — o `linhaParaMsg` devolve `midiaUrl: null`

A lógica pura da fatia 1 acrescenta `midiaUrl: null` ao objeto que monta (o evento não tem URL assinada).
O teste dela ganha o campo.

### Os componentes de mídia

O `Midia` de hoje se divide. **Se o `Inbox.tsx` estiver grande (é ~640 linhas), extrair para
`src/app/(app)/atendimento/Midia.tsx`** — decisão no plano, olhando o arquivo.

- **`MidiaImagem`** — miniatura recortada (`w-60 h-[170px] object-cover rounded-xl`), clicável; ao clicar,
  chama `onAbrirLightbox(url, nome)`.
- **`MidiaAudio`** — `<audio controls src={midiaUrl}>` num container do balão (largura compacta). Sem
  legenda (áudio de voz não tem) — mantém o `eslint-disable` já existente.
- **`MidiaDocumento`** — cartão: ícone do tipo (de `iconeDeMime`), nome truncado, `mime` legível, e o ⤓ que
  baixa (via a rota-proxy com `Content-Disposition: attachment`, ou a URL assinada).
- **`Lightbox`** — overlay `fixed inset-0 z-50 bg-black/90`, imagem centralizada, botões ✕ e "baixar".
  Fecha no ✕, clique no fundo, ou **Esc** (listener de `keydown`). Controlado por estado no `Inbox`
  (`lightbox: { url, nome } | null`).

### A lógica pura — `iconeDeMime`

`src/lib/whatsapp/midia.ts` (novo, ou dentro de `realtime.ts`):
```ts
export function iconeDeMime(mime: string | null): "PDF" | "DOC" | "XLS" | "IMG" | "AUDIO" | "ARQ";
```
Mapa: `application/pdf`→PDF; `msword`/`wordprocessingml`→DOC; `ms-excel`/`spreadsheetml`→XLS;
`image/*`→IMG; `audio/*`→AUDIO; resto→ARQ. Testável sem DOM.

## Verificação

- **`src/tests/whatsapp/midia.test.ts`** (novo): `iconeDeMime` para pdf, doc, xls, imagem, áudio, mime
  desconhecido e `null`.
- **`realtime.test.ts`** (fatia 1): atualizado para o `midiaUrl: null` no `linhaParaMsg`.
- **Não-regressão:** os testes de `inbox`/`atendimento` seguem verdes; `lint`, `typecheck`, `build`,
  `format:check` limpos.
- **Visual (o teste real):** com um arquivo real — receber/enviar uma imagem (miniatura + lightbox), um
  PDF (cartão + baixar) e um áudio (player) e conferir os quatro.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Tamanho do arquivo no cartão | Não está no schema; coluna + backfill desproporcional. |
| Miniatura gerada no servidor (thumbnail real) | A imagem cheia recortada por CSS basta — as imagens do WhatsApp já vêm comprimidas. |
| Vídeo | O Z-API raramente envia; se vier, cai no cartão de documento. |
| O visual geral do Atendimento (balões de texto, fundo) | Fatia à parte. |
| Leitura de cadastro (o `select` sem filtro) | É a **sub-fatia 3**, a próxima. |

## Riscos

| Risco | Mitigação |
|---|---|
| A URL assinada expirar com a conversa aberta parada | Validade de 10 min + refetch a cada 30s renova. Se expirar antes do refetch, a imagem quebra por segundos até o próximo refetch; o fallback do proxy (que não expira) pode cobrir o download. |
| Assinar N mídias custar N chamadas ao Storage | `createSignedUrls` (plural) assina a lista da conversa numa chamada. |
| Uma mídia nova (evento Realtime) aparecer sem URL | `midiaUrl: null` no evento; o refetch de ~1s traz a URL. Atraso de segundos, não instantâneo — coerente com a fatia 1. |
| O lightbox prender o foco/scroll | Fecha no Esc e no clique no fundo; `overflow-hidden` no body enquanto aberto. |
