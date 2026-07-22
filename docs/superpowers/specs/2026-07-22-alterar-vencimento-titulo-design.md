# Alterar vencimento do título (design)

## Objetivo

Permitir reagendar o vencimento de uma **conta a receber (título)** direto na tela, em um clique — e,
quando houver boleto ativo, reemiti-lo junto com a nova data. Resolve o caso real: título **vencido,
sem boleto**, que hoje não pode ter boleto emitido (o Inter recusa data no passado) e não tem como ter
a data corrigida na aplicação.

## Contexto (do que existe)

- **VENCIDO é derivado, não persistido** (`src/lib/financeiro/titulos.ts` → `ehVencido`): o status
  armazenado de um título "vencido em aberto" é **`ABERTO`**; a tela mostra "Vencido" por cálculo
  (vencimento no passado + saldo). Logo, ao reagendar para uma data futura, o rótulo volta a "Em
  aberto" **sozinho**, sem escrever status.
- `emitirBoleto` usa `titulo.vencimento`; o Inter recusa emissão com vencimento < hoje ("O valor deve
  ser igual ou maior à data atual") — foi o erro observado.
- Actions de título em `src/app/(app)/financeiro/contas-a-receber/actions.ts`
  (`criarCobrancaAvulsa`, `registrarBaixa`, `cancelarTitulo` em `boleto-actions.ts`) — **nenhuma edita
  o vencimento de um título existente**.
- Blocos reutilizáveis já prontos (6.67.0): `validarNovaVencimento` (`src/lib/boleto/vencimento.ts`),
  `emitirBoletoNucleo` e `cancelarBoletoNoInter`.
- UI da linha em `src/components/financeiro/ContasReceber.tsx` (ações: Baixar, Cobrar, Cancelar,
  `BoletoTitulo`); `cancelarTitulo` só aparece quando `podeCancelarTitulo(status, somaBaixado)`.

## Decisões (do brainstorm)

- **Alterar no nível do TÍTULO**, e **reemitir o boleto junto** quando houver boleto ativo.
- **Substitui** o botão "Alterar vencimento" do **boleto** (entregue no 6.67.0, escopo "só o boleto"):
  esse é **removido** para não haver dois botões parecidos na mesma linha.
- **Sem migration.**

## Comportamento

Nova server action `alterarVencimentoTitulo(tituloId: string, novaData: string)` (`YYYY-MM-DD`), em
`src/app/(app)/financeiro/contas-a-receber/actions.ts`:

1. **Gate** financeiro (admin/financeiro), como as demais.
2. **Carrega** o título (`id, valor, descricao, status, cliente_id, vencimento`).
   - Rejeita se o status armazenado **≠ `ABERTO`** (baixado/parcial/cancelado não reagendam):
     "Só é possível reagendar título em aberto."
   - (Reusa o espírito de `podeCancelarTitulo`; na prática, exige `status === 'ABERTO'` e sem baixa.)
3. **Valida** `novaData` com `validarNovaVencimento(novaData, titulo.vencimento, hojeISO)` — formato,
   data real, **≥ hoje**, ≠ atual. O "≥ hoje" é intencional: o objetivo é reagendar para frente e, se
   houver boleto, o Inter exige data futura.
4. **Atualiza** `titulo.vencimento = novaData` (via `createAdminSupabase`, como `cancelarTitulo`).
5. **Se houver boleto ativo** (`status = 'emitido'`) para o título: **cancela + reemite** com a
   `novaData` (reusa `cancelarBoletoNoInter` + `emitirBoletoNucleo`), ordem cancelar→reemitir. Falha
   na reemissão → o título **já** foi reagendado; reporta: "Vencimento alterado, mas a reemissão do
   boleto falhou: … Use 'Emitir boleto' para gerar novamente."
6. `revalidatePath` da rota; retorna `{ ok: true }`.

Sem boleto ativo (caso da tela reportada): passos 4 e 6 apenas — o título é reagendado e passa a
permitir "Emitir boleto" com a data nova.

## UI

- Novo componente client `src/components/financeiro/AlterarVencimentoTitulo.tsx`: botão **"Alterar
  vencimento"** que revela um `<input type="date">` inline (pré-preenchido com o vencimento atual) +
  "Confirmar"/"Cancelar"; chama `alterarVencimentoTitulo`, trata `erro` com `alert`, chama `onMudou()`
  no sucesso. Usa `controleCls("compacto")` no input.
- Em `ContasReceber.tsx`, renderizar `<AlterarVencimentoTitulo tituloId={t.id} vencimento={t.vencimento}
  onMudou={…} />` na célula de ações **quando `podeCancelarTitulo(status, t.somaBaixado)`** (mesma
  condição do "Cancelar" — título reagendável). O `onMudou` reaproveita o mesmo refresh já usado após
  as outras ações da linha (recarrega títulos e boletos).

## Remoção (do 6.67.0)

- Remover o botão **"Alterar vencimento"** de `BoletoTitulo.tsx` e a action `alterarVencimentoBoleto`
  (fica órfã) de `boleto-actions.ts`.
- Remover o teste `src/tests/financeiro/alterar-vencimento-render.test.tsx` (era do botão do boleto).
- Manter `emitirBoletoNucleo`, `validarNovaVencimento` (reusados) e `BoletoView.vencimento` (já
  populado; inofensivo — pode servir de exibição futura).

## Fora de escopo

- Alterar **valor** do título (só a data).
- Reenvio automático do boleto ao cliente (manual, como no 6.67.0).
- Reagendar título **baixado/parcial/cancelado**.

## Testes

- `validarNovaVencimento` já coberto (6.67.0) — reusado, sem novo teste.
- **Render** (`AlterarVencimentoTitulo`) — botão aparece e revela o campo de data.
- **Da action** — sem harness de mock de Supabase para actions no repo (padrão do módulo); cobertura
  por typecheck/build + smoke manual: (a) título vencido sem boleto → reagenda e emite; (b) título com
  boleto → reagenda e o boleto novo sai com a data nova, o antigo cancelado.

## Entrega

Uma release (bump de versão, um PR, um deploy). **Sem migration.**
