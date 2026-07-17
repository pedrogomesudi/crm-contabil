# Telefone internacional (DDI no cadastro) — Design

**O que é:** um campo de DDI (código do país) antes do telefone, para o envio de WhatsApp funcionar
fora do Brasil. Hoje o número é sempre tratado como brasileiro — o DDI `55` é chutado em qualquer
número de 10–11 dígitos.

## O problema (medido)

`src/lib/whatsapp/mensagem.ts` tem duas funções, ambas hardcoded para o Brasil:

```ts
export function normalizarTelefone(bruto: string): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;      // <- chuta 55
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}
export function chaveTelefone(bruto: string): string | null {   // <- insere o "9" brasileiro
  const t = normalizarTelefone(bruto);
  if (!t) return null;
  const resto = t.slice(2);
  if (resto.length === 10) return `55${resto.slice(0, 2)}9${resto.slice(2)}`;
  return t;
}
```

Um número dos EUA (`555 123 4567`, 10 dígitos) vira `55` + número americano — telefone inexistente.
E `chaveTelefone` inseriria um "9" no meio dele.

**A coluna hoje:** `clientes.telefone text` (migration `0003_clientes.sql:11`) guarda **só o número local**
(ex.: `(34) 99999-8888`). O `55` nunca esteve no banco — é adicionado no envio.

**Os 5 pontos que normalizam para enviar** (todos leem `cliente.telefone`):

| Arquivo | Linha | Função |
|---|---|---|
| `src/app/(app)/comunicados/actions.ts` | 201 | `normalizarTelefone` |
| `src/app/(app)/nfse/lote/envio.ts` | 61 | `normalizarTelefone` |
| `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts` | 22 | `normalizarTelefone` |
| `src/lib/whatsapp/regua-motor.ts` | 130 | `normalizarTelefone` |
| `src/app/(app)/atendimento/actions.ts` | 138, 204, 228, 321, 354 | `chaveTelefone` |

**E o webhook** (`src/app/api/webhooks/zapi/[secret]/route.ts:45,50`): recebe `msg.telefone` **já completo
com DDI** (o Z-API sempre manda assim) e casa a conversa comparando `chaveTelefone(msg.telefone)` com
`chaveTelefone(cliente.telefone)` de cada cliente. É aqui que o casamento precisa passar a concatenar o
DDI do cliente.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Como informar o país | **Campo DDI separado, default `+55`, antes do telefone** | O cliente brasileiro (todos os 99 atuais) não muda nada. O país fica explícito, não adivinhado. |
| Armazenamento | **Coluna nova `telefone_ddi text default '55'`** | Aditivo: o formato de `telefone` não muda, nada que já lê a coluna quebra. Migração trivial (o default cobre os 99). |
| Nono dígito (`chaveTelefone`) | **Só quando DDI = `55`** | É uma regra do WhatsApp brasileiro. Inserir "9" num número de outro país o corromperia. |
| Normalização por país (fora do BR) | **FORA de escopo** | Vários países têm regras próprias de dígitos — resolver cada uma é o que uma biblioteca (`libphonenumber`, ~100KB) faz. Para os **primeiros** clientes internacionais, informar o número completo basta. |

## Arquitetura

### O banco

```sql
-- supabase/migrations/NNNN_telefone_ddi.sql
alter table clientes add column if not exists telefone_ddi text not null default '55';
```

Idempotente. O `default '55'` faz os 99 clientes atuais já ficarem corretos — **sem migração de dados**.
O número local segue em `telefone`, formato inalterado.

Também tocar as duas RPCs de importação que inserem `telefone`
(`0016_importacao_aplicar_rpc.sql`, `0027_import_nao_altera_existentes.sql`): a importação não traz DDI,
então a coluna nova cai no default `55` — **nenhuma mudança nas RPCs é necessária** (o insert não lista
`telefone_ddi`, o default assume). Confirmar isso no plano, não presumir.

### `src/lib/whatsapp/mensagem.ts` — o núcleo

Duas mudanças de contrato. As funções passam a receber o DDI explicitamente:

```ts
// Monta o número no formato Z-API: DDI + número local, só dígitos.
// O ddi vem do cadastro (coluna telefone_ddi); default "55" por segurança.
export function normalizarTelefone(local: string, ddi: string = "55"): string | null {
  const d = String(local ?? "").replace(/\D/g, "");
  const dd = String(ddi ?? "55").replace(/\D/g, "") || "55";
  // Compat: se o "local" JÁ vier com o 55 na frente (dados antigos, 12–13 díg BR), respeita.
  if (dd === "55" && (d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length < 6 || d.length > 15) return null; // fora do intervalo E.164 plausível
  return `${dd}${d}`;
}

// Chave canônica para casar conversas. Só o Brasil tem o nono dígito volátil; para os demais
// países, a chave é o número inteiro (DDI + local), sem inserir nada.
export function chaveTelefone(local: string, ddi: string = "55"): string | null {
  const t = normalizarTelefone(local, ddi);
  if (!t) return null;
  if (!t.startsWith("55")) return t;            // não-BR: como está
  const resto = t.slice(2);
  if (resto.length === 10) return `55${resto.slice(0, 2)}9${resto.slice(2)}`; // insere o 9
  return t;
}
```

> **O webhook é o caso especial.** Ele recebe o número já completo (`msg.telefone`), sem DDI separado. Ali
> `chaveTelefone(msg.telefone)` continua chamado **com um argumento** (o default `"55"` não é usado — o
> número já traz o país). Como `normalizarTelefone` agora respeita um número que já começa com `55` e tem
> comprimento BR, e devolve os demais como estão, o webhook funciona sem mudar a chamada. Do lado do
> cliente, o casamento passa a ser `chaveTelefone(c.telefone, c.telefone_ddi)`.

### Os 6 consumidores

Cada um passa a `select` também `telefone_ddi` e a repassá-lo:

- **comunicados, nfse/lote, contas-a-receber, regua-motor:** `normalizarTelefone(c.telefone, c.telefone_ddi)`.
- **atendimento/actions (5 chamadas):** só **3** mudam. Nas linhas 138, 204, 321, 354 o `chaveTelefone`
  é aplicado ao **cliente** (`c.telefone`) e comparado com um `telefone` que já é chave canônica de conversa
  (argumento vindo do webhook, com DDI). Essas viram `chaveTelefone(c.telefone, c.telefone_ddi)`.
  - A linha 228 (`iniciarConversa`) é **diferente**: o `telefone` vem do usuário digitando no `Inbox`
    (`novoTel`), sem DDI separado. Fica com um argumento (default `55`). **Limitação declarada:** iniciar
    conversa com um número internacional *pelo Inbox* exige digitar o número completo com DDI no próprio
    campo — o Inbox não ganha campo de DDI nesta fatia. O envio a cliente **cadastrado** (comunicados,
    régua, NFS-e), que é o pedido original, funciona pleno. Ver "Fora de escopo".
- **webhook zapi:** a chamada `chaveTelefone(msg.telefone)` não muda; a comparação com o cliente vira
  `chaveTelefone(c.telefone, c.telefone_ddi)` (o select passa a trazer `telefone_ddi`).

### O cadastro (`src/components/FormCliente.tsx`)

Hoje (linha 209–210):
```tsx
<FormCampo label="Telefone / WhatsApp" span={3}>
  <input name="telefone" defaultValue={c.telefone ?? ""} className={`${controleCls()} w-full`} />
</FormCampo>
```

Vira dois campos lado a lado — DDI estreito + telefone:
```tsx
<FormCampo label="DDI" span={1}>
  <input
    name="telefone_ddi"
    inputMode="numeric"
    defaultValue={c.telefone_ddi ?? "55"}
    className={`${controleCls()} w-full`}
    aria-label="Código do país"
  />
</FormCampo>
<FormCampo label="Telefone / WhatsApp" span={2}>
  <input name="telefone" defaultValue={c.telefone ?? ""} className={`${controleCls()} w-full`} />
</FormCampo>
```

O `span` total continua 3 (era `span={3}` só no telefone). O DDI aceita 1–4 dígitos; o `+` não é
digitado (some no `replace(/\D/g, "")`). A action de salvar cliente passa a ler e gravar `telefone_ddi`.

### Exibição

`formatarTelefone` (`src/lib/format.ts:60`) formata só o número local (10–11 díg) — **não muda**. Onde o
telefone é exibido com o país, prefixar `+{ddi} ` na tela é opcional e pode ficar para depois; o essencial
é o envio funcionar. O plano decide caso a caso se vale prefixar (a ficha do cliente, o `Inbox`).

## Verificação

- **`src/tests/whatsapp/mensagem.test.ts`** ganha casos: DDI 55 (comportamento atual, inalterado — os
  testes existentes passam como estão, chamando com um argumento), DDI 1 (EUA, sem nono dígito), DDI 351
  (Portugal), e a compat de número que já vem com 55.
- **Não-regressão:** todo o comportamento brasileiro atual é preservado. Os testes existentes de
  `mensagem.test.ts` (que chamam `normalizarTelefone("(34) 99999-8888")` sem DDI) **continuam passando**
  pelo default `"55"`.
- `lint`, `typecheck`, `build`, `format:check`, `npm test` limpos.
- **RLS/migration:** `npm run db:migrate` aplica a coluna; `npm run db:test` verde.
- **Visual:** o Pedro confere o cadastro (o campo DDI ao lado do telefone) e faz um envio de teste.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Normalização de dígitos por país (nono dígito de outros países, remoção de zeros de tronco, etc.) | Precisaria de `libphonenumber`. Para os primeiros clientes internacionais, informar o número completo basta. |
| Seletor de país com bandeira / validação por país | Mesma razão — biblioteca pesada para um caso ainda raro. |
| Converter `telefone` para E.164 no banco | A coluna separada evita mexer nos 99 registros e em tudo que lê `telefone`. |
| O portal do cliente | Não coleta telefone para envio. |
| Campo de DDI no `Inbox` (iniciar conversa nova) | O pedido é enviar a cliente **cadastrado**. Iniciar conversa avulsa com internacional pelo Inbox exige digitar o número completo no campo — raro, e o número já existe no cadastro na prática. |

## Riscos

| Risco | Mitigação |
|---|---|
| Mudar a assinatura de `normalizarTelefone`/`chaveTelefone` quebrar algum chamador | O `ddi` tem default `"55"`, então chamada com um argumento = comportamento de hoje. `typecheck` pega qualquer chamador. São 6 arquivos, todos listados. |
| O casamento de conversa do atendimento parar de casar clientes BR | O default `"55"` + a compat de "número que já tem 55" preservam a chave brasileira byte a byte. Os testes de `inbox`/`atendimento` cobrem. |
| A importação de clientes gravar DDI errado | Ela não lista `telefone_ddi` no insert → cai no default `55`. Confirmar no plano lendo as duas RPCs. |
| Um cliente BR ter o DDI apagado no cadastro | A action normaliza: DDI vazio → `55`. Nunca gravar DDI em branco. |
