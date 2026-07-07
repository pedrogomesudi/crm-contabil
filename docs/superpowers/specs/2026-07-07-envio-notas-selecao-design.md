# Envio de notas — seleção de lote determinado — Design

**Data:** 2026-07-07
**Marco:** aprimoramento do envio de notas + cobrança (seleção manual das notas a enviar).
**Contexto:** Já existe o painel "Enviar notas + cobrança do mês" (`EnviarNotasWhatsapp`) que dispara para
**todas** as NFS-e autorizadas da competência, com progresso e reenvio de falhas. O usuário quer
**selecionar quais notas** enviar (um lote determinado), com indicação do que já foi enviado.

## Objetivo

Ao verificar uma competência, mostrar a **lista das notas** com caixas de seleção e um selo
**"já enviada"**; por padrão, marcar só as **pendentes**; e disparar apenas as **selecionadas**.

## Escopo

- `listarNotasParaEnvio` passa a indicar, por nota, se **já foi enviada** com sucesso.
- UI: lista com checkbox + razão social + selo "já enviada"; busca; selecionar todas/limpar;
  "Enviar selecionadas (N)"; mantém progresso e reenvio de falhas.

Fora de escopo (YAGNI): disparo automático (cron/na emissão) — o `enviarNotaWhatsapp` já é reutilizável
para plugar depois.

## Actions — `src/app/(app)/nfse/lote/envio.ts`

`listarNotasParaEnvio` muda a assinatura para incluir `jaEnviada`:

```ts
export async function listarNotasParaEnvio(
  competencia: string,
): Promise<{ nfseId: string; razaoSocial: string; jaEnviada: boolean }[]>;
```

Implementação:
1. `notas = await listarNotasAutorizadasPorCompetencia(competencia)` (como hoje).
2. Se vazio → `[]`.
3. `admin` = service_role. Busca os envios com sucesso dessas notas:
   `select nfse_id from whatsapp_mensagem where status='ENVIADO' and nfse_id in (<ids das notas>)`.
   Monta um `Set<string>` de `nfse_id` enviados.
4. Retorna `notas.map((n) => ({ nfseId: n.nfseId, razaoSocial: n.razaoSocial, jaEnviada: enviadas.has(n.nfseId) }))`.

`enviarNotaWhatsapp` — **inalterado** (o dedup por `ENVIADO` continua como rede de segurança).

## UI — `src/components/nfse/EnviarNotasWhatsapp.tsx`

Estado:
- `notas: { nfseId; razaoSocial; jaEnviada }[] | null` (resultado do Verificar).
- `selecionadas: Set<string>` (nfseIds marcados).
- `busca: string` (filtro por razão social).
- (mantém `enviando`, `prog`, `falhas`, `pararRef`, `mes`.)

Fluxo:
- **Verificar** → carrega `notas`; **pré-seleciona** os `nfseId` com `jaEnviada === false`
  (`selecionadas = new Set(notas.filter(n => !n.jaEnviada).map(n => n.nfseId))`).
- **Lista** (quando `notas` e não enviando): busca no topo; controles **"Selecionar todas"** /
  **"Limpar"**; cada linha:
  - checkbox (marca/desmarca o `nfseId` em `selecionadas`),
  - razão social,
  - selo **"já enviada"** (cinza/positivo) quando `jaEnviada`.
  - filtro: mostra só as linhas cujo `razaoSocial` contém a `busca` (case-insensitive).
- Botão **"Enviar selecionadas (N)"** (N = `selecionadas.size`), desabilitado se `N === 0` → chama
  `enviar(notasSelecionadas)` onde `notasSelecionadas = notas.filter(n => selecionadas.has(n.nfseId))`.
- **Confirmação** antes de disparar (envio real): `confirm("Enviar para N cliente(s)…")`.
- **Progresso** e **reenviar as que falharam** — como hoje (o `enviar(alvo?)` já aceita uma sublista).

Observações de UX:
- "Selecionar todas" marca todos os `nfseId` **visíveis pelo filtro** (ou todos, se sem filtro);
  "Limpar" esvazia. (Decisão: marcar/limpar considerando o filtro atual, para o lote determinado.)
- O selo "já enviada" é informativo; o usuário pode marcar uma já-enviada para reenviar de propósito
  (o `enviarNotaWhatsapp` vai pulá-la pelo dedup, contando como "pulado" no resumo).

## Tratamento de erros
- Nenhuma nota na competência → aviso "Nenhuma nota autorizada".
- Nenhuma selecionada → botão desabilitado.
- Erros de envio por nota → contabilizados; lista de falhas + reenvio (fluxo atual).

## Testes
- **Unit (Vitest):** helper puro `preSelecionadas(notas: { nfseId: string; jaEnviada: boolean }[]): Set<string>`
  → `Set` dos `nfseId` com `jaEnviada === false`, em `src/lib/whatsapp/notas-envio.ts` (junto de
  `linhasPagamento`/`competenciaBR`). O restante (query `jaEnviada`, UI) valida no build + deploy.
- **Smoke:** `EnviarNotasWhatsapp` renderiza sem lançar (ajustar o mock se necessário).

## Migrations
Nenhuma.
