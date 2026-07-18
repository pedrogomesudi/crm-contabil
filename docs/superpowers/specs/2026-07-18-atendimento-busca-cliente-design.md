# Atendimento — busca unificada por cliente — Design

**O que é:** um campo de busca no topo da lista de conversas que, ao receber o nome da empresa, mostra as
**conversas existentes** que casam E os **clientes cadastrados sem conversa** (para iniciar uma). É a
terceira e última das melhorias funcionais do Atendimento.

## O problema (medido)

Hoje há **duas buscas separadas e incompletas**:

1. **O campo da lista** (`busca` → `filtrarConversas`, `inbox.ts:221`) filtra pelo nome do cliente e
   telefone — mas **só entre as conversas existentes** e **só na aba selecionada** (aberta/pendente/
   finalizada). Um cliente cuja conversa está noutra aba não é encontrado.
2. **O formulário "nova conversa"** (escondido atrás do botão `+`, o estado `nova`) busca clientes
   cadastrados por nome (`buscaCliente` → `clientesFiltrados`, `Inbox.tsx:80`) para **preencher um
   telefone** e iniciar. Está escondido e só serve para iniciar, não para achar uma conversa em andamento.

Nenhuma responde direto a "achar/falar com a empresa X". No WhatsApp é um campo só.

**O que já dá para reusar:** os dois lados usam o **mesmo telefone canônico** (`chaveTelefone`) — a
`Conversa.telefone` e o `listarClientesParaConversa` (`actions.ts:370`) retornam a mesma chave. Então dá
para cruzar: um cliente "tem conversa" se seu telefone canônico está entre as conversas.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Busca | **Unificada, estilo WhatsApp: um campo, duas seções** (Conversas / Iniciar conversa) | Resolve os dois casos num lugar; é o "como o WhatsApp" pedido. |
| Escopo da busca de conversa | **Todas as abas** (não filtra por status quando há termo) | Achar o cliente não deve depender de qual aba está aberta. |
| Cliente que já tem conversa | **Aparece só em "Conversas"**, não duplica em "Iniciar" | Evita o mesmo cliente nas duas seções. |
| Campo vazio | **Lista normal por aba** (o `filtrarConversas` de hoje) | Sem busca, nada muda. |
| Otimização de escala (varredura de clientes) | **FORA de escopo** | É preparação, não dói hoje (99 clientes). Vira pendência registrada. |
| O formulário `nova` (atrás do `+`) | **A busca de cliente sai de dentro dele**; o compositor de nova conversa permanece | A busca vira o caminho principal; o `+`/compositor só envia a 1ª mensagem. |

## Arquitetura

### A lógica pura — `buscaUnificada`

`src/lib/whatsapp/inbox.ts` (onde já vivem `filtrarConversas` e `mapaClientesPorTelefone`):

```ts
export type ClienteParaConversa = { razaoSocial: string; contato: string | null; telefone: string };

export function buscaUnificada(
  conversas: Conversa[],
  clientes: ClienteParaConversa[],
  termo: string,
): { conversas: Conversa[]; iniciar: ClienteParaConversa[] } {
  const t = termo.trim().toLowerCase();
  if (!t) return { conversas: [], iniciar: [] }; // sem termo, a busca não se aplica (a lista usa filtrarConversas)

  // Conversas que casam nome do cliente OU telefone — de QUALQUER aba.
  const conversasCasadas = conversas.filter((c) =>
    `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`.includes(t),
  );

  // Telefones que já têm conversa (canônicos) — para não duplicar em "iniciar".
  const jaTemConversa = new Set(conversas.map((c) => c.telefone));

  // Clientes que casam o nome E ainda não têm conversa.
  const iniciar = clientes.filter(
    (cl) => cl.razaoSocial.toLowerCase().includes(t) && !jaTemConversa.has(cl.telefone),
  );

  return { conversas: conversasCasadas, iniciar };
}
```

> `ClienteParaConversa` é o formato que `listarClientesParaConversa` já retorna
> (`{ razaoSocial, contato, telefone }`). Se ainda não for um tipo exportado, exportar aqui e reusar.

### O Inbox

- **O estado `busca`** já existe; passa a alimentar tanto `filtrarConversas` (campo vazio → lista por aba)
  quanto `buscaUnificada` (campo com termo → duas seções).
- **`clientesConv`** (a lista de clientes, já carregada via `listarClientesParaConversa` no mount) vira o
  segundo argumento da `buscaUnificada` — já está em memória, sem chamada nova.
- **A renderização da lista:** quando `busca` tem termo, renderiza a seção "Conversas" (as
  `resultado.conversas`) e a seção "Iniciar conversa" (as `resultado.iniciar`), cada uma com um cabeçalho
  discreto. Sem termo, a lista de hoje (`visiveis = filtrarConversas(...)`).
- **Clicar numa conversa** → abre (o `abrir(telefone)` de hoje). **Clicar num "iniciar"** → começa a
  conversa com aquele cliente: preenche o telefone e abre o compositor (o fluxo de `iniciarConversa`).
- **O formulário `nova`:** a busca de cliente (`buscaCliente`/`clientesFiltrados`) sai de dentro dele —
  vira redundante. O `+`/compositor fica só para digitar a primeira mensagem ao cliente escolhido pela
  busca (ou por telefone avulso, que já existe).

### O que NÃO muda

- **`iniciarConversa`, `abrirConversa`, o webhook, a RLS, o tempo real, a mídia** — intocados.
- **A varredura de clientes** (`listarClientesParaConversa` traz todos) — fica; a otimização é outra fatia.

## Verificação

- **`src/tests/whatsapp/busca.test.ts`** (novo): `buscaUnificada` — termo casa conversa; termo casa
  cliente sem conversa; cliente **com** conversa não aparece em "iniciar" (dedup pelo telefone canônico);
  termo vazio devolve as duas listas vazias; casa por telefone além do nome.
- **Não-regressão:** `filtrarConversas` e os testes de `inbox`/`atendimento` seguem verdes; `lint`,
  `typecheck`, `build`, `format:check` limpos.
- **Visual (o teste real):** digitar o nome de uma empresa e ver a conversa existente (se houver) e a
  opção de iniciar (se o cliente não tiver conversa); clicar em cada um faz a ação certa.

## Fora de escopo

| O quê | Por quê |
|---|---|
| **Otimização de escala** (a varredura `select` de todos os clientes) | Preparação, não dói hoje. Pendência registrada para quando o volume crescer — a solução seria armazenar a chave canônica numa coluna indexada. |
| Busca dentro das mensagens (por texto de mensagem) | Outra funcionalidade; esta busca é por cliente/conversa. |
| O visual geral do Atendimento (balões, fundo) | Fatia à parte. |

## Riscos

| Risco | Mitigação |
|---|---|
| Um cliente com conversa numa aba "finalizada" some da busca | A `buscaUnificada` **não** filtra por aba — busca em todas. É o objetivo. |
| O mesmo cliente aparecer nas duas seções | Dedup pelo telefone canônico (`jaTemConversa`) — se tem conversa, sai de "iniciar". |
| A busca ficar lenta com muitas conversas/clientes | É filtro em memória sobre listas já carregadas; para os volumes atuais e previstos é instantâneo. Se um dia crescer, é a mesma pendência de escala. |
| Remover o `nova` quebrar o fluxo de telefone avulso | O compositor (digitar telefone + mensagem) permanece; só a busca de cliente **de dentro dele** sai, porque vira redundante com a busca principal. |
