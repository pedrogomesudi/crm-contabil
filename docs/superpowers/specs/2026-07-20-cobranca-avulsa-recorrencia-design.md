# Cobrança avulsa + flag de honorários recorrentes — Design

**Data:** 2026-07-20
**Módulo:** Financeiro (Contas a Receber) + Cadastro do cliente (aba Financeiro)

## Contexto

Hoje o único gerador de título a receber é a RPC `gerar_mensalidades` (contrato ATIVO ou
`clientes_financeiro.honorario_mensal > 0`). Não existe criação manual de recebível em aberto — para
emitir um boleto é preciso ter honorário recorrente por trás, o que obriga a inventar honorário/contrato
para cobrar algo pontual. Além disso, "recorrência" é derivada, não um campo explícito: não há como marcar
um cliente como "só cobrança avulsa".

Esta entrega adiciona (1) **cobrança avulsa** — criar um título a receber em aberto para um cliente
existente, opcionalmente já emitindo o boleto; e (2) uma **flag explícita** "tem honorários recorrentes"
no cliente, que funciona como interruptor mestre da geração automática.

`emitirBoleto(tituloId)` já aceita qualquer título ABERTO/VENCIDO — não muda. O gate de tudo é
`podeGerenciarFinanceiro` (admin/financeiro), coerente com a RLS de `titulo`.

## Decisões

1. **Flag = interruptor mestre (prevalece sobre contrato).** Cliente com `tem_honorarios_recorrentes=false`
   **não gera mensalidade**, mesmo com contrato ATIVO. `default true` preserva o comportamento atual.
2. **Cobrança avulsa é para cliente existente.** O boleto exige CNPJ/endereço do cliente; "avulsa" =
   não depende de honorário recorrente, não "sem cliente".
3. **Categoria obrigatória** no título avulso (coerência com a DRE e com a receita avulsa da conciliação).
4. **Checkbox "emitir boleto agora"**: cria o título e, se marcado, emite o boleto no mesmo passo. Falha do
   boleto **não perde o título** — devolve aviso.
5. **Honorário quando não-recorrente:** campo visível porém desabilitado, com aviso (preserva histórico).
6. **Competência derivada do vencimento** (mês do vencimento, dia 01), como a receita avulsa da conciliação.

## Arquitetura

### Fatia A — Cobrança avulsa

**Lógica pura** — `src/lib/financeiro/cobranca-avulsa.ts`:
```ts
export type EntradaAvulsa = { clienteId: string; valor: number; vencimento: string; categoriaId: string };
export function competenciaDoVencimento(vencimento: string): string; // "YYYY-MM-01"
export function validarCobrancaAvulsa(e: EntradaAvulsa): { ok: true } | { ok: false; erro: string };
// erros: sem cliente, valor <= 0, vencimento fora de YYYY-MM-DD, sem categoria.
```

**Ação** — `criarCobrancaAvulsa` em `src/app/(app)/financeiro/contas-a-receber/actions.ts`:
- gate `gateGerir` (podeGerenciarFinanceiro); valida com `validarCobrancaAvulsa`.
- insere em `titulo`: `tipo:"RECEBER", origem:"RECEITA_AVULSA", status:"ABERTO", cliente_id, valor,
  vencimento, competencia (competenciaDoVencimento), categoria_id, descricao, criado_por`.
- assinatura: `criarCobrancaAvulsa(input, emitirBoletoAgora: boolean)`. Se `emitirBoletoAgora`, após o
  insert chama a lógica de `emitirBoleto(tituloId)`; se a emissão falhar, retorna
  `{ ok:true, tituloId, avisoBoleto: motivo }` (título permanece). Sem o flag: `{ ok:true, tituloId }`.
- `revalidatePath` da tela.

**UI** — `src/components/financeiro/ContasReceber.tsx`:
- botão **"Nova cobrança avulsa"** abre um form inline: **cliente** (select de clientes ativos),
  **descrição**, **valor**, **vencimento**, **categoria** (select de categorias de receita), checkbox
  **"emitir boleto agora"**. Ao salvar, recarrega a lista da competência.
- rótulo de origem na tabela: exibir **"Avulsa"** quando `origem === "RECEITA_AVULSA"` (hoje só trata
  MENSALIDADE/DECIMO_TERCEIRO em `ContasReceber.tsx:116`).
- a page passa a lista de clientes ativos e as categorias de receita para o componente (novas queries no
  `page.tsx` de contas-a-receber, ou via as actions existentes de catálogo).

`emitirBoleto`, `listarTitulos`, `listarBoletosDaCompetencia` **não mudam** — o título avulso com
competência entra neles naturalmente.

### Fatia B — Flag de honorários recorrentes

**Schema** (migration idempotente):
```sql
alter table clientes_financeiro
  add column if not exists tem_honorarios_recorrentes boolean not null default true;
```

**RPC** — nova migration com `create or replace function gerar_mensalidades(...)` (migrations aplicadas
são imutáveis; o runner reaplica a função). Adicionar a condição da flag aos **três blocos** (contrato,
honorário, 13º), tratando ausência de linha em `clientes_financeiro` como `true` (default):
`... and coalesce((select cf.tem_honorarios_recorrentes from clientes_financeiro cf where cf.cliente_id = ...), true)`.
Efeito: cliente com a flag `false` não gera nada, mesmo com contrato ATIVO (flag prevalece).

**UI** — `src/components/HonorarioForm.tsx`:
- checkbox **"Cliente tem honorários recorrentes"** no topo.
- quando desmarcado, o input "honorário mensal" fica **desabilitado** com aviso "cliente sem cobrança
  recorrente — só avulsa".
- se o cliente tiver **contrato ATIVO** e a flag for desmarcada, exibir aviso de conflito ("tem contrato
  ativo, mas está marcado como não-recorrente — não gerará mensalidade").
- `salvarHonorario` (`src/app/(app)/clientes/actions.ts`) persiste `tem_honorarios_recorrentes` no upsert
  (via `normalizarExtensaoFinanceira`); o `select` da page do cliente passa a ler a coluna.

## Testes

- `src/tests/financeiro/cobranca-avulsa.test.ts` — `validarCobrancaAvulsa` (sem cliente / valor ≤ 0 / sem
  categoria / vencimento inválido / caso feliz) e `competenciaDoVencimento` (mês do vencimento, dia 01).
- Render do form "Nova cobrança avulsa" (campos + checkbox de boleto presentes).
- Render de `HonorarioForm` com a flag desmarcada → honorário desabilitado + aviso.
- RPC validada por `npm run db:test` quando houver Session pooler; a regra "flag prevalece" fica
  documentada na migration.

## Fatiamento

- **Fatia A — cobrança avulsa** (desbloqueia a emissão avulsa imediata): lógica pura, ação
  `criarCobrancaAvulsa` (com caminho de boleto), form + botão em Contas a Receber, rótulo "Avulsa".
- **Fatia B — flag de recorrência**: coluna nova, RPC recriada com a flag, checkbox + avisos na aba
  Financeiro do cliente. Depende de A? Não — independentes; A primeiro por resolver o bloqueio.

## Constraints do projeto (herdadas)

- Next 16 App Router; imports `@/*`; segredos server-only.
- Gate financeiro = `podeGerenciarFinanceiro` (admin/financeiro); aba Financeiro do cliente =
  `podeVerHonorario` (admin/financeiro/contador).
- Migrations imutáveis; novas idempotentes; RPC recriada via `create or replace`.
- Guard `divida-ui`: sem `border` estático em input escrito à mão (usar `controleCls`); sem `←`/`amber-\d`.
- `package.json.version` sobe com o CHANGELOG no mesmo PR; `versao.test.ts` exige que batam.

## Fora de escopo

- Cobrança avulsa para não-cliente (exigiria tomador externo sem cadastro — o boleto precisa do cadastro).
- Parcelamento do avulso (só título único; parcelamento fica para depois se necessário).
- Ajuste retroativo de mensalidades já geradas ao desmarcar a flag (só afeta gerações futuras).
