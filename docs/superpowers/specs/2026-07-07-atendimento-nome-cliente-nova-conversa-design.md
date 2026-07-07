# Atendimento — nome do cliente na conversa + nova conversa por cliente — Design

**Data:** 2026-07-07
**Marco:** ajuste do Atendimento (nome resolvido pelo cadastro + iniciar conversa por cliente).
**Contexto:** Hoje a conversa mostra o **telefone** quando as mensagens não foram vinculadas a um cliente
no recebimento (ex.: `5534991724064`); e a "nova conversa" só aceita digitar um número. Queremos exibir
**empresa + contato** (do cadastro) e permitir **iniciar conversa escolhendo um cliente cadastrado**.

## Objetivo

1. Na lista/cabeçalho, quando o telefone casar com um cliente cadastrado, mostrar **razão social**
   (linha 1) + **responsável/contato** (linha 2), em vez do número.
2. Na "nova conversa", **buscar um cliente cadastrado** (com telefone) para iniciar o atendimento —
   mantendo a opção de digitar um número avulso.

## Escopo

- Resolução do nome **na exibição** (casa telefone → cadastro ao listar), cobrindo conversas antigas.
- Casa só quando há **exatamente um** cliente com aquele telefone (ambíguo → mostra o telefone).
- Nova conversa: busca de clientes com telefone + campo de número avulso.

Fora de escopo (YAGNI): editar o cadastro pela tela de atendimento; criar cliente a partir de um número
novo (já há o atalho "Cadastrar cliente" no painel do contato).

## Read model — `src/lib/whatsapp/inbox.ts`

```ts
export type Conversa = {
  telefone: string;
  cliente: string | null;        // razão social (do cadastro casado, com fallback)
  contato: string | null;        // <- novo: responsável (responsavel_nome)
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
  status: StatusConversa;
  atendenteId: string | null;
  atendenteNome: string | null;
};

export type ConversaMeta = {
  favorita?: boolean;
  status?: StatusConversa;
  atendenteId?: string | null;
  atendenteNome?: string | null;
  cliente?: string | null;       // <- novo: override do nome pelo cadastro
  contato?: string | null;       // <- novo
};
```

`agruparConversas`: `cliente = md?.cliente ?? (mensagem-derivado) ?? null`; `contato = md?.contato ?? null`.
(O casamento por telefone tem prioridade sobre o `cliente_id` da mensagem — cobre também as não
vinculadas.)

### Helper puro — `mapaClientesPorTelefone` (TDD)

```ts
// Mapa telefone-normalizado → { razaoSocial, contato }. Só telefones com UM único cliente
// (ambíguos são descartados). Usa normalizarTelefone (de mensagem.ts).
export function mapaClientesPorTelefone(
  clientes: { razao_social: string; responsavel_nome: string | null; telefone: string | null }[],
): Map<string, { razaoSocial: string; contato: string | null }>;
```

Regras: normaliza cada `telefone`; ignora vazios; se dois clientes normalizam para o mesmo telefone,
**remove** essa chave (ambíguo). `contato = responsavel_nome ?? null`.

## Actions — `src/app/(app)/atendimento/actions.ts`

- `listarConversas()` — além do que já faz, busca `clientes(razao_social, responsavel_nome, telefone)`
  (via admin), monta `mapaClientesPorTelefone`, e **semeia** o `Map<telefone, ConversaMeta>` com
  `{ cliente: razaoSocial, contato }` por telefone; depois **mescla** as linhas de `conversa`
  (favorita/status/atendente) nas entradas existentes (sem apagar cliente/contato). Chaves batem porque
  `whatsapp_mensagem.telefone` já é a forma normalizada (mesmo do webhook).
- `listarClientesParaConversa(): Promise<{ razaoSocial: string; contato: string | null; telefone: string }[]>`
  — clientes com telefone (normalizado), ordenados por razão social, para o seletor da nova conversa.
  Gate `podeAtender`. (Retorna o telefone já normalizado para o `iniciarConversa`.)

## UI — `src/app/(app)/atendimento/Inbox.tsx`

### Item da lista
- **Linha 1:** `c.cliente ?? c.telefone` (empresa ou número) + horário.
- **Linha 2 (nova, cinza pequena):** `c.contato` — só quando houver.
- **Linha de prévia (mantida):** chip de status (se ≠ aberta) + primeiro nome do atendente + última
  mensagem + badge de não-lidas.
(Item fica com até 3 linhas quando há contato; some a linha 2 sem contato.)

### Cabeçalho da thread
Usar a **conversa ativa** (`convAtiva`) como fonte do nome/contato (evita confundir com a variável de
estado `contato`, que é o `DadosContato` do painel à direita):
- Nome = `convAtiva?.cliente ?? ativa` (empresa ou telefone).
- Abaixo: `convAtiva?.contato` (responsável, se houver) e o `ativa` (telefone).
- O painel do contato à direita continua usando o estado `contato` (DadosContato) — sem alteração.

### Nova conversa (ícone de lápis)
Ao abrir o painel, carrega `listarClientesParaConversa()` (uma vez) em estado. O painel passa a ter:
1. **Busca de cliente:** input "Buscar cliente…" → lista filtrada (razão social + telefone); clicar
   preenche o campo de número (`novoTel`) e mostra o nome escolhido.
2. **Telefone** (`novoTel`) — editável (contato avulso).
3. **Mensagem** + **Iniciar** / **Cancelar** (fluxo atual `iniciarConversa`).

## Tratamento de erros
- Telefone sem cliente casado → mostra o número (comportamento atual); sem contato → sem linha 2.
- Telefone ambíguo (2+ clientes) → tratado como sem match (mostra número).

## Testes
- **Unit (Vitest):** `mapaClientesPorTelefone` (casamento único; normalização; ambíguo descartado;
  telefone vazio ignorado) e `agruparConversas` com `meta.cliente`/`meta.contato` (override + fallback).
- **Smoke:** `Inbox` renderiza com a `Conversa` estendida (campo `contato`) sem lançar — ajustar o
  literal do smoke.

## Migrations
Nenhuma (só read model + UI + actions).
