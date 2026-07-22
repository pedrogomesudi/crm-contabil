# Alterar vencimento do boleto (design)

## Objetivo

Permitir alterar a data de vencimento de um boleto já emitido em **uma ação/um clique**, no lugar do
trio manual atual (alterar título → cancelar boleto → gerar de novo). A dor é operacional: hoje, para
adiar um vencimento, o financeiro cancela o boleto e emite outro manualmente.

## Contexto (do módulo atual)

- O vencimento do boleto **deriva do vencimento do título**: `emitirBoleto(tituloId)` lê
  `titulo.vencimento` e monta a emissão via `dadosEmissaoDeTitulo`.
- Emissão/cancelamento vivem em `src/app/(app)/financeiro/contas-a-receber/boleto-actions.ts`
  (`emitirBoleto`, `cancelarBoleto`) e `src/lib/boleto/cancelar-exec.ts` (`cancelarBoletoNoInter`).
- Fato bancário: **o vencimento é codificado no código de barras / linha digitável** (fator de
  vencimento). Mudar a data **sempre** produz um boleto novo (nova linha digitável); o antigo deixa
  de valer. Não existe "editar a data mantendo o mesmo código".
- **Capacidade dos provedores:** o **Inter (Cobrança v3)** não tem endpoint de edição — só
  emitir/consultar/cancelar/pdf/webhook. O **Asaas** tem `PUT /payments`, mas o adaptador atual só
  faz GET/POST e **não cancela do lado do Asaas** (o `cancelarBoletoNoInter` só propaga o
  cancelamento quando `provedor === 'inter'`; para Asaas apenas marca `status='cancelado'` no banco).
- Tabela `boleto` (0059): `titulo_id`, `numero` (sequência), `provedor`, `provedor_boleto_id`,
  `nosso_numero`, `linha_digitavel`, `pix_copia_cola`, `url_pdf`, `valor`, `vencimento`, `status`
  (`emitido|pago|cancelado|erro`). RLS: `admin`/`financeiro`.

## Decisões (do brainstorm)

- **Escopo da data: só o boleto.** A nova data vale para o boleto; o **título não é alterado**.
- **Reenvio: manual.** A ação só gera o boleto novo e atualiza a tela; o envio ao cliente
  (WhatsApp/e-mail) continua manual, pelo fluxo atual.
- **Mecanismo: cancelar + reemitir** (uniforme para os provedores; obrigatório no Inter). Ordem
  **cancelar → reemitir**, para nunca haver dois boletos ativos ao mesmo tempo (evita risco de
  pagamento duplicado).
- **Sem migration.** Reusa a tabela `boleto` existente.

## Comportamento

Nova server action `alterarVencimentoBoleto(boletoId: string, novaData: string)`
(`novaData` em `YYYY-MM-DD`), no mesmo arquivo `boleto-actions.ts`:

1. **Gate:** `podeGerenciarFinanceiro` (admin/financeiro), como em `emitir`/`cancelar`.
2. **Carrega** o boleto (`id, titulo_id, provedor, provedor_boleto_id, vencimento, status`).
   - Rejeita se `status !== 'emitido'`: "Só é possível alterar o vencimento de boleto emitido."
3. **Valida** `novaData` (helper puro `validarNovaVencimento`):
   - formato `YYYY-MM-DD` válido; **≥ hoje**; **≠** vencimento atual do boleto.
   - Mensagens: data passada → "A nova data não pode ser anterior a hoje."; igual → "A nova data é
     igual à atual."; inválida → "Data inválida."
4. **Cancela** o boleto atual: `cancelarBoletoNoInter(admin, {id, provedor, provedor_boleto_id,
   status}, motivo)` com `motivo = "Alteração de vencimento para DD/MM/AAAA"` (≤ 50 chars, limite do
   Inter). Falha aqui → aborta e reporta: "Falha ao cancelar no provedor: …" (nada foi reemitido).
5. **Reemite** com a nova data, reusando o núcleo de emissão (ver Arquitetura): carrega
   `titulo` (`valor, descricao, cliente_id, status`) + `cliente` (`razao_social, cpf_cnpj, email,
   endereco`), pega `proximo_numero_boleto`, monta `dadosEmissaoDeTitulo({ ...titulo, vencimento:
   novaData }, cliente, numero)` e chama `adaptador.emitir`. Grava nova linha `boleto`
   (`vencimento = novaData`, novos ids/linha/pix/pdf, `valor` do título).
   - Falha na reemissão → o título fica **sem boleto ativo** (o antigo já foi cancelado). Reporta:
     "Boleto cancelado, mas a reemissão falhou: … Use 'Emitir boleto' para gerar novamente."
6. `revalidatePath("/financeiro/contas-a-receber")`; retorna `{ ok: true }`.

## Arquitetura

- **Refatorar o miolo de emissão** de `emitirBoleto` para uma função interna reutilizável, para não
  duplicar a lógica entre emitir e reemitir:
  `async function emitirBoletoNucleo(supabase, titulo, vencimento): Promise<{ ok?: true; erro?:
  string }>` — recebe o título já carregado (`id, valor, descricao, cliente_id`) e o `vencimento` a
  usar (o próprio do título na emissão normal; a `novaData` na alteração), carrega o cliente, monta a
  emissão via `dadosEmissaoDeTitulo({ ...titulo, vencimento }, cliente, numero)`, chama o provedor e
  insere a linha `boleto`. A checagem de duplicidade ("já existe boleto para este título") **fica em
  `emitirBoleto`, antes de chamar o núcleo** — não no núcleo; na alteração ela não se aplica porque a
  antiga já foi cancelada no passo 4 (e a checagem já ignora `cancelado`/`erro`). `emitirBoleto` vira
  um wrapper: gate → carrega título → checa status/duplicidade → `emitirBoletoNucleo(supabase,
  titulo, titulo.vencimento)`.
- `alterarVencimentoBoleto` orquestra: valida → cancela → `emitirBoletoNucleo(..., novaData)`.
- **Helper puro** `validarNovaVencimento(novaData: string, vencimentoAtual: string, hojeISO: string):
  { ok: true } | { erro: string }` em `src/lib/boleto/vencimento.ts` — testável sem I/O; recebe
  `hojeISO` por parâmetro (determinístico).

## UI

- `BoletoView` (em `boleto-actions.ts`) ganha o campo **`vencimento: string`**; o `select` de
  `listarBoletosDaCompetencia` passa a incluir `vencimento`.
- `src/components/financeiro/BoletoTitulo.tsx`: quando `status === "emitido"`, além de "Cancelar
  boleto", um botão **"Alterar vencimento"**. Ao clicar, revela um `<input type="date">` inline
  (pré-preenchido com o vencimento atual) + "Confirmar"/"Cancelar". Ao confirmar, chama
  `alterarVencimentoBoleto(boleto.id, data)`, trata `erro` com `alert` e chama `onMudou()` no sucesso
  (padrão dos outros botões do componente).

## Efeito colateral (documentado)

Como **só o boleto** muda, a **cobrança/inadimplência/relatórios continuam seguindo a data do
TÍTULO**. Se o boleto for adiado, o título pode aparecer como **vencido** enquanto o boleto novo
ainda é válido — e a régua de inadimplência/suspensão (`escritorio_config.suspensao_*`) usa o título.
É a consequência natural de "só o boleto"; aceito no brainstorm. Não há mitigação nesta entrega.

## Fora de escopo

- Alterar também o vencimento do título (decisão explícita: só o boleto).
- Reenvio automático ao cliente (manual).
- Edição nativa via Asaas `PUT /payments` e o conserto do cancelamento Asaas (limitação
  pré-existente; produção usa Inter). Não pioro nem conserto agora.
- Alterar **valor** do boleto (só data).

## Testes

- **Puro** (`src/tests/boleto/vencimento.test.ts`) — `validarNovaVencimento`: aceita data futura
  diferente; rejeita data passada, data igual à atual e formato inválido.
- **Da action** (estendendo o padrão dos testes de boleto existentes) — sucesso (cancela a antiga +
  cria nova com `vencimento = novaData`, mesma `titulo_id`, título intocado); rejeição por
  `status !== 'emitido'`; rejeição por data inválida/passada; falha de reemissão após cancelamento
  reporta o erro e deixa a antiga cancelada.
- **Render** (`BoletoTitulo`) — o botão "Alterar vencimento" aparece só com `status === 'emitido'` e
  revela o campo de data.

## Entrega

Uma **única release** junto com o fix da faixa da sidebar (um bump de versão, um PR, um deploy).
Sem migration.
