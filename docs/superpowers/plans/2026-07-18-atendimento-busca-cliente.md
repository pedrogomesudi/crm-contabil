# Atendimento — busca unificada por cliente — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-atendimento-busca-cliente-design.md`.

**Objetivo:** um campo de busca que, ao receber o nome da empresa, mostra as conversas existentes (de
qualquer aba) e os clientes cadastrados sem conversa (para iniciar uma).

**Arquitetura:** uma função pura `buscaUnificada` cruza conversas × clientes pelo telefone canônico que os
dois já compartilham. O Inbox alimenta essa função com o estado que já tem em memória (`conversas`,
`clientesConv`) e renderiza duas seções quando há termo; sem termo, a lista de hoje.

**Stack:** Next.js 16, TypeScript, vitest.

## Global Constraints

- **Nenhuma mudança no servidor, no webhook, na RLS, no tempo real, na mídia.** Esta fatia é só a busca —
  filtro em memória sobre listas já carregadas.
- **Sem migration, sem infra** — é só código.
- **A otimização de escala (varredura de clientes) fica FORA** — pendência registrada.
- **`main` protegido:** PR de `develop` com o `verify` verde. **O merge não publica** (Implantar + health).
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/whatsapp/inbox.ts` | **Modificar** — `ClienteParaConversa` (export) + `buscaUnificada` | 1 |
| `src/tests/whatsapp/busca.test.ts` | **Criar** — testa `buscaUnificada` | 1 |
| `src/app/(app)/atendimento/actions.ts` | **Modificar** — `listarClientesParaConversa` usa o tipo exportado | 1 |
| `src/app/(app)/atendimento/Inbox.tsx` | **Modificar** — renderiza as 2 seções; remove a busca do `nova` | 2 |
| `CHANGELOG.md` | **Modificar** | 3 |

---

### Task 1: `buscaUnificada` — a lógica pura

**Files:**
- Modify: `src/lib/whatsapp/inbox.ts` (após `filtrarConversas`, ~linha 235)
- Modify: `src/app/(app)/atendimento/actions.ts` (`listarClientesParaConversa`, ~370)
- Test: `src/tests/whatsapp/busca.test.ts`

**Interfaces:**
- Consumes: `Conversa` (já em `inbox.ts`).
- Produces:
  - `type ClienteParaConversa = { razaoSocial: string; contato: string | null; telefone: string }`
  - `buscaUnificada(conversas: Conversa[], clientes: ClienteParaConversa[], termo: string): { conversas: Conversa[]; iniciar: ClienteParaConversa[] }`

- [ ] **Step 1: Escrever o teste que falha**

`src/tests/whatsapp/busca.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buscaUnificada, type ClienteParaConversa } from "@/lib/whatsapp/inbox";
import type { Conversa } from "@/lib/whatsapp/inbox";

const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534988403020",
  cliente: "Moura Purcell",
  contato: null,
  ultima: "oi",
  ultima_em: "2026-07-18T12:00:00Z",
  nao_lidas: 0,
  favorita: false,
  status: "aberta",
  atendenteId: null,
  atendenteNome: null,
  ...over,
});

const cli = (over: Partial<ClienteParaConversa>): ClienteParaConversa => ({
  razaoSocial: "Agroalves Ltda",
  contato: null,
  telefone: "5511999998888",
  ...over,
});

describe("buscaUnificada", () => {
  it("termo vazio → duas listas vazias (a lista usa filtrarConversas)", () => {
    expect(buscaUnificada([conv({})], [cli({})], "  ")).toEqual({ conversas: [], iniciar: [] });
  });

  it("casa conversa pelo nome do cliente, de qualquer aba", () => {
    const finalizada = conv({ status: "finalizada", cliente: "Moura Purcell" });
    const r = buscaUnificada([finalizada], [], "moura");
    expect(r.conversas).toEqual([finalizada]);
    expect(r.iniciar).toEqual([]);
  });

  it("casa cliente SEM conversa em 'iniciar'", () => {
    const r = buscaUnificada([], [cli({ razaoSocial: "Agroalves Ltda" })], "agro");
    expect(r.iniciar.map((c) => c.razaoSocial)).toEqual(["Agroalves Ltda"]);
  });

  it("cliente COM conversa não duplica em 'iniciar' (dedup pelo telefone canônico)", () => {
    const c = conv({ telefone: "5511999998888", cliente: "Agroalves Ltda" });
    const cl2 = cli({ razaoSocial: "Agroalves Ltda", telefone: "5511999998888" });
    const r = buscaUnificada([c], [cl2], "agro");
    expect(r.conversas).toEqual([c]);
    expect(r.iniciar).toEqual([]); // já tem conversa → não aparece em iniciar
  });

  it("casa conversa por telefone além do nome", () => {
    const r = buscaUnificada([conv({ telefone: "5534988403020", cliente: null })], [], "3498840");
    expect(r.conversas.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/busca.test.ts`
Expected: FAIL — `buscaUnificada`/`ClienteParaConversa` não existem.

- [ ] **Step 3: Implementar em `inbox.ts`**

Em `src/lib/whatsapp/inbox.ts`, após a função `filtrarConversas`:
```ts
export type ClienteParaConversa = { razaoSocial: string; contato: string | null; telefone: string };

// Busca unificada estilo WhatsApp: dado um termo, devolve as conversas que casam (nome do cliente ou
// telefone, de QUALQUER aba) e os clientes cadastrados que casam o nome E ainda NÃO têm conversa. O
// cruzamento é possível porque os dois lados usam o mesmo telefone canônico (chaveTelefone).
export function buscaUnificada(
  conversas: Conversa[],
  clientes: ClienteParaConversa[],
  termo: string,
): { conversas: Conversa[]; iniciar: ClienteParaConversa[] } {
  const t = termo.trim().toLowerCase();
  if (!t) return { conversas: [], iniciar: [] };

  const conversasCasadas = conversas.filter((c) => `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`.includes(t));
  const jaTemConversa = new Set(conversas.map((c) => c.telefone));
  const iniciar = clientes.filter((cl) => cl.razaoSocial.toLowerCase().includes(t) && !jaTemConversa.has(cl.telefone));

  return { conversas: conversasCasadas, iniciar };
}
```

- [ ] **Step 4: Reusar o tipo em `actions.ts`**

Em `src/app/(app)/atendimento/actions.ts`, trocar o tipo de retorno inline de `listarClientesParaConversa`
pelo tipo exportado. Adicionar ao import de `@/lib/whatsapp/inbox` o `ClienteParaConversa`, e:
```ts
export async function listarClientesParaConversa(): Promise<ClienteParaConversa[]> {
```
e o `const out: ClienteParaConversa[] = [];` no corpo. (Mesma forma, só nomeando o tipo — sem mudança de
comportamento.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/busca.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/inbox.ts src/tests/whatsapp/busca.test.ts src/app/\(app\)/atendimento/actions.ts
git commit -m "feat(whatsapp): buscaUnificada (conversas + iniciar, cruzadas pelo telefone canonico)"
```

---

### Task 2: As duas seções no Inbox

**Files:**
- Modify: `src/app/(app)/atendimento/Inbox.tsx`

**Interfaces:**
- Consumes: `buscaUnificada` (Task 1), o estado `busca`/`conversas`/`clientesConv` (já existem), `abrir(tel)`.

- [ ] **Step 1: Calcular o resultado da busca**

Após `const visiveis = filtrarConversas(conversas, aba, busca);` (linha 78), adicionar:
```tsx
  const buscando = busca.trim().length > 0;
  const resultado = buscando ? buscaUnificada(conversas, clientesConv, busca) : null;
```
E somar `buscaUnificada` ao import **já existente** de `@/lib/whatsapp/inbox` (o bloco que traz
`filtrarConversas, contadores, horaMsg, …`, linha ~22): acrescentar a linha `buscaUnificada,`.

- [ ] **Step 2: Renderizar as duas seções quando há busca**

Onde hoje está `{visiveis.map((c) => ( … ))}` (linha 355), envolver numa condicional. Quando `buscando`,
renderizar as duas seções; senão, a lista de hoje. O item de conversa é o mesmo `<div role="button">` de
hoje — extrair num sub-componente `ItemConversa` (dentro do arquivo) evita duplicar o JSX.

Extrair primeiro o item (o `<div role="button" … >…</div>` inteiro que hoje está no `visiveis.map`,
linhas ~356-425) para um sub-componente **dentro do mesmo arquivo**:
```tsx
function ItemConversa({
  c,
  ativa,
  onAbrir,
  onToggleFavorita,
}: {
  c: Conversa;
  ativa: string | null;
  onAbrir: (tel: string) => void;
  onToggleFavorita: (c: Conversa) => void;
}) {
  // ...o mesmo JSX de hoje, sem mudar aparência:
  //   - onClick do <div>: onAbrir(c.telefone)   (era abrir(c.telefone))
  //   - onKeyDown Enter/Espaço: onAbrir(c.telefone)
  //   - o botão de estrela: onClick={(e) => { e.stopPropagation(); onToggleFavorita(c); }}
  //     (era toggleFavorita(c) inline)
}
```
> `toggleFavorita` **já é uma função** no `Inbox` (chamada hoje inline no botão da estrela), então o item
> só a recebe via prop e a repassa. `abrir` e `iniciais` idem. Mover o JSX sem alterar aparência.

Depois, no lugar do `visiveis.map`:
```tsx
{buscando && resultado ? (
  <>
    {resultado.conversas.length > 0 && (
      <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-mono-muted">Conversas</p>
    )}
    {resultado.conversas.map((c) => (
      <ItemConversa key={c.telefone} c={c} ativa={ativa} onAbrir={abrir} onToggleFavorita={toggleFavorita} />
    ))}
    {resultado.iniciar.length > 0 && (
      <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-wider text-mono-muted">Iniciar conversa</p>
    )}
    {resultado.iniciar.map((cl) => (
      <button
        key={cl.telefone}
        type="button"
        onClick={() => abrir(cl.telefone)}
        className="flex w-full items-center gap-3 border-b border-linha/60 px-4 py-3 text-left hover:bg-creme/60"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linha text-sm font-semibold text-cinza">
          {iniciais(cl.razaoSocial)}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-texto">{cl.razaoSocial}</span>
          <span className="block truncate text-xs text-cinza-claro">
            {cl.contato ? `${cl.contato} · ` : ""}iniciar conversa
          </span>
        </div>
      </button>
    ))}
    {resultado.conversas.length === 0 && resultado.iniciar.length === 0 && (
      <p className="px-4 py-6 text-center text-sm text-cinza-claro">Nada encontrado para “{busca}”.</p>
    )}
  </>
) : (
  visiveis.map((c) => <ItemConversa key={c.telefone} c={c} ativa={ativa} onAbrir={abrir} onToggleFavorita={toggleFavorita} />)
)}
```
> Clicar num "iniciar conversa" chama `abrir(cl.telefone)` — abre a thread (vazia) por telefone; o
> compositor aparece e o `iniciarConversa` roda ao mandar a 1ª mensagem, exatamente como hoje.

- [ ] **Step 3: Atualizar o placeholder do campo de busca**

Trocar o `placeholder="Buscar conversa ou telefone"` (linha ~330) por
`placeholder="Buscar cliente, conversa ou telefone"`.

- [ ] **Step 4: Remover a busca de cliente de dentro do `nova`**

No formulário `nova` (o bloco `{nova && ( … )}`, ~linha 266), remover o `<input value={buscaCliente}>` e o
bloco `{clientesFiltrados.length > 0 && ( … )}` — a busca principal agora cobre isso. Manter o input de
telefone (`novoTel`), o de mensagem (`novoTexto`) e o botão Iniciar (telefone avulso). Remover o estado
`buscaCliente`/`setBuscaCliente` e o `clientesFiltrados` que ficaram órfãos (o `typecheck`/`lint`
apontam).

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. Sem variáveis órfãs (`buscaCliente`/`clientesFiltrados` removidos).

- [ ] **Step 6: Conferir na tela** — `npm run dev`, `/atendimento`: digitar o nome de uma empresa; ver a
  seção "Conversas" (existentes, de qualquer aba) e "Iniciar conversa" (cadastrados sem conversa); clicar
  em cada um abre a thread certa; campo vazio volta à lista por aba.

- [ ] **Step 7: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(atendimento): busca unificada — conversas + iniciar conversa por nome da empresa"
```

---

### Task 3: Documentar e entregar

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG — em `[Não lançado]`**

```markdown
### Adicionado

- **Atendimento — busca por cliente:** o campo de busca da lista passa a achar o cliente pelo **nome da
  empresa** em duas seções, como no WhatsApp: as **conversas existentes** que casam (de qualquer aba, não
  só a selecionada) e os **clientes cadastrados sem conversa** para **iniciar** uma. Some o formulário de
  busca escondido atrás do `+` — a busca principal cobre os dois casos.
```

- [ ] **Step 2: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 3: PR**

```bash
git add -A
git commit -m "docs: registra a busca unificada por cliente no atendimento"
git push origin develop
gh pr create --base main --head develop --title "Atendimento: busca unificada por cliente (nome da empresa)"
gh pr checks --watch
```

- [ ] **Step 4: A release, na ordem certa**

> **Sem migration, sem infra.** É só código. Depois do merge: **Implantar** no EasyPanel → conferir
> `/api/health` → e, se for lançar versão, o bump de `package.json` + CHANGELOG no mesmo PR, com a tag
> depois do health. Ver `docs/VERSIONAMENTO.md`.
