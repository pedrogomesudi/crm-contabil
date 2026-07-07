# Envio de notas fiscais + cobrança (PIX/TED) via WhatsApp — Design

**Data:** 2026-07-07
**Marco:** automação de envio de NFS-e + dados de pagamento aos clientes pelo WhatsApp.
**Contexto:** WhatsApp ativo (envio de texto e **mídia/PDF** — Fatia B); DANFSe fica em cache no
storage (`documentos/danfse/{chave}.pdf`); a régua (`regua-motor.ts`) já mostra o padrão de iterar
títulos + enviar respeitando o opt-out `cobranca_whatsapp`. Esta feature envia, **em lote sob
comando**, a NFS-e (PDF) + a mensagem com PIX/TED para cada cliente com nota autorizada no mês.

## Objetivo

Da tela de NFS-e em lote, escolher a competência e disparar para cada cliente: o **DANFSe** anexado +
uma **mensagem** com honorário e dados de pagamento (PIX + TED), com **progresso e reenvio das falhas**
(mesma UX do download em lote), sem reenviar quem já recebeu.

## Escopo

- **Todas as NFS-e autorizadas** da competência (a mensagem diz "se já pagou, desconsidere").
- **PIX + TED** — conta **única do escritório** (config global).
- **Sob comando** (botão), com progresso por nota e reenvio das que falharam.
- Respeita o opt-out `clientes_financeiro.cobranca_whatsapp` e pula clientes sem telefone.

Fora de escopo (YAGNI): agendar por cron (o envio por nota fica reutilizável para plugar depois), dados
bancários por cliente, boleto/link de pagamento.

## Dados

### Migration `0045_dados_pagamento.sql`

```sql
create table if not exists dados_bancarios (
  id                int primary key default 1,
  pix_chave         text,
  banco             text,
  agencia           text,
  conta             text,
  titular           text,
  documento         text,
  mensagem_template text not null default
    'Olá {nome}! Segue a sua nota fiscal de serviços (NFS-e), referente ao honorário de {valor} — competência {competencia}.\n\nPara pagamento:\n{pagamento}\n\nSe já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição!',
  atualizado_em     timestamptz not null default now(),
  constraint dados_bancarios_singleton check (id = 1)
);
alter table dados_bancarios enable row level security;
do $$ begin
  drop policy if exists dados_bancarios_admin on dados_bancarios;
  create policy dados_bancarios_admin on dados_bancarios for all to authenticated
    using (auth_papel() = 'admin') with check (auth_papel() = 'admin');
end $$;

-- vínculo/dedup do envio da nota
alter table whatsapp_mensagem add column if not exists nfse_id uuid references nfse(id) on delete set null;
create index if not exists idx_wa_msg_nfse on whatsapp_mensagem(nfse_id) where nfse_id is not null;
```

Dados bancários **não são segredo** (vão para o cliente) → texto puro. O motor lê via `service_role`
(bypassa RLS); a página de config é admin. **Sem unique** em `nfse_id`: a deduplicação é por
"já enviada com sucesso" (permite reenviar as que falharam).

## Helper puro — `src/lib/whatsapp/notas-envio.ts` (TDD)

```ts
export type DadosPagamento = { pixChave?: string | null; banco?: string | null; agencia?: string | null; conta?: string | null; titular?: string | null; documento?: string | null };

// Monta as linhas de pagamento a partir dos dados preenchidos (omite as vazias).
export function linhasPagamento(d: DadosPagamento): string;

// Competência "2026-07-01" → "07/2026".
export function competenciaBR(dataIso: string): string;
```

`linhasPagamento`:
- Se `pixChave` → linha `PIX: {pixChave}`.
- TED: junta `Banco {banco}`, `Ag. {agencia}`, `Conta {conta}` (só os preenchidos); se houver algo,
  linha `TED: {...}` + ` — {titular}` (se houver) + ` ({documento})` (se houver).
- Retorna as linhas unidas por `\n` (string vazia se nada preenchido).

A mensagem final usa `aplicarTemplate(template, { nome, valor, competencia, pagamento })` (de
`mensagem.ts`), com `pagamento = linhasPagamento(dados)`.

## DANFSe reutilizável — `src/lib/nfse/danfse-cache.ts` (novo, refactor)

Extrai de `src/app/(app)/clientes/[id]/nfse.ts` a lógica de cache+ADN para uma lib server-only:

```ts
export async function obterDanfsePdf(
  admin: ReturnType<typeof createAdminSupabase>,
  nfseId: string,
): Promise<{ pdfBase64?: string; chave?: string; erro?: string }>;
```

Faz: carrega a nota (`chave_acesso, ambiente, emitente, cliente_id`); tenta o **cache** no storage
(`danfse/{chave}.pdf`); se faltar, carrega o certificado (cifrado) + baixa do ADN (`baixarDanfsePdf`) +
guarda no cache. Move para cá os helpers privados `caminhoDanfse`, `lerDanfseStorage`,
`guardarDanfseStorage`, `carregarCertRowDaNota`. **`baixarDanfseNfse`** (a action, com gate) passa a só
gatear + chamar `obterDanfsePdf` (sem duplicar a lógica).

## Actions — `src/app/(app)/nfse/lote/envio.ts` (novo, "use server")

- `listarNotasParaEnvio(competencia: string): Promise<{ nfseId: string; razaoSocial: string }[]>` —
  reusa/espelha `listarNotasAutorizadasPorCompetencia` (NFS-e `autorizada` da competência). Gate
  `podeVerHonorario`.
- `enviarNotaWhatsapp(nfseId: string): Promise<{ status: "ok" | "pulado" | "erro"; motivo?: string; razaoSocial: string }>`:
  1. Gate `podeVerHonorario`.
  2. `admin` = service_role. Carrega a nota (`id, cliente_id, valor, competencia, chave_acesso`) +
     cliente (`razao_social, telefone, clientes_financeiro(cobranca_whatsapp)`).
  3. Opt-out (`cobranca_whatsapp === false`) → `pulado`. Telefone inválido → `pulado`.
  4. **Dedup:** existe `whatsapp_mensagem` com `nfse_id = nfseId` e `status = 'ENVIADO'`? → `pulado`
     (já enviada).
  5. Carrega config Z-API (`whatsapp_config`, decifra) e `dados_bancarios`. Sem config Z-API → `erro`.
  6. `obterDanfsePdf(admin, nfseId)` → sem PDF → `erro` (permite reenvio depois).
  7. `texto = aplicarTemplate(template, vars)` com `vars = { nome: razaoSocial,
     valor: formatarMoeda(valor), competencia: competenciaBR(competencia),
     pagamento: linhasPagamento(dados), pix: dados.pixChave ?? "", banco: dados.banco ?? "",
     agencia: dados.agencia ?? "", conta: dados.conta ?? "", titular: dados.titular ?? "",
     documento: dados.documento ?? "" }` — o template padrão usa `{pagamento}` (bloco composto que
     omite campos vazios), mas o admin pode editar para usar as variáveis individuais.
  8. `enviarMidiaZapi(zapi, tel, { tipo: "document", base64: pdf, mime: "application/pdf",
     nome: "NFS-e " + razaoSocial + ".pdf", caption: texto })`.
  9. Insert `whatsapp_mensagem`: `direcao 'OUT'`, `nfse_id`, `cliente_id`, `telefone`, `texto`,
     `status` (ENVIADO/ERRO), `midia_tipo 'document'`, `midia_path = danfse/{chave}.pdf` (o cache),
     `midia_nome`, `midia_mime 'application/pdf'`, `z_message_id`, `resposta`. Retorna `ok`/`erro`.

O envio é **por nota** (a UI faz o loop) → dá progresso, permite reenviar as falhas e evita uma única
chamada longa de servidor (77 notas × ~1s). Mesmo padrão do download em lote.

## UI — `src/components/nfse/EnviarNotasWhatsapp.tsx` + tela

Painel na tela **NFS-e em lote** (`/nfse/lote`, ao lado do "Baixar notas do mês"), espelhando
`BaixarNotasZip`:
- Competência (month) + "Verificar" (mostra quantas notas) → `listarNotasParaEnvio`.
- "Enviar N notas" → loop client-side chamando `enviarNotaWhatsapp` por nota, com contador
  `✓ enviados · ⤼ pulados · ✗ erros` e barra de progresso; "Parar".
- Ao fim, se houver erros, lista as que falharam (razão social) + botão **"Reenviar as que falharam"**.
- Aviso de confirmação antes de disparar (é envio real para clientes).

### Config — `src/app/(app)/configuracoes/pagamento/page.tsx` (novo, admin)

Formulário dos `dados_bancarios` (PIX + banco/agência/conta/titular/documento + template editável),
action `salvarDadosPagamento`. Adicionar o card **"Dados de pagamento (PIX/TED)"** ao hub
`/configuracoes`.

## Fluxo (resumo)
```
Configurar dados_bancarios (1x, admin) →
NFS-e em lote → escolher competência → Verificar → Enviar →
  por nota: dedup (já enviada? pula) → DANFSe do cache → mensagem (template + PIX/TED) →
  enviarMidiaZapi(document + caption) → registra OUT (nfse_id) →
Resumo enviados/pulados/erros → Reenviar falhas
```

## Tratamento de erros
- Sem dados bancários configurados → o `linhasPagamento` volta vazio; a mensagem ainda vai, mas sem
  pagamento. A UI avisa (antes de enviar) se `dados_bancarios` está vazio.
- Falha no DANFSe (ADN) ou no envio → conta como `erro`, **não** grava dedup de sucesso → reenviável.
- Cliente sem telefone / opt-out → `pulado` (não é erro).

## Testes
- **Unit (Vitest):** `linhasPagamento` (PIX+TED, só PIX, só TED, vazio) e `competenciaBR`.
- **Migration:** aplicar; verificar tabela `dados_bancarios` + coluna `nfse_id`.
- **Smoke:** `EnviarNotasWhatsapp` renderiza sem lançar.
- O refactor `obterDanfsePdf` é coberto por `npm run build`/typecheck (sem regressão em
  `baixarDanfseNfse`).

## Migrations
Uma migration nova: `0045_dados_pagamento.sql` (tabela + coluna + RLS/índice). Sem enum/`ALTER TYPE`.
