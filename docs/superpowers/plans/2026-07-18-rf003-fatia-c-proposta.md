# RF-003 — Fatia C (integração na proposta) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-18-rf003-precificacao-honorarios-design.md`. Fecha a RF-003.
> Depende das Fatias A e B (em produção, v6.15.0): tabelas de config, motor `calcularHonorario`, calculadora.

**Objetivo:** o botão **"Calcular honorários"** no editor da proposta abre a calculadora; ao confirmar,
acrescenta os itens (honorário consolidado + serviços) e salva o **snapshot** do cálculo na proposta.

**Arquitetura:** um ajuste no motor (o desconto passa a incidir **só no honorário**; os serviços entram
depois, sem desconto — decisão do Pedro), um helper puro `itensProposta` que transforma o cálculo em linhas
da proposta, a coluna `proposta.precificacao jsonb` para o snapshot, e a integração no `EditorProposta`
reusando a `Calculadora` com um callback `onUsar`.

**Stack:** Next.js 16 (Server Actions), Supabase, TypeScript, vitest.

## Global Constraints

- **Decisão de dinheiro (trava desta fatia):** o item **"Honorários contábeis"** leva o honorário
  (base + acréscimos × complexidade − desconto, com piso) — **o desconto incide só nele**. Cada **serviço**
  marcado vira uma **linha própria** pelo valor de tabela, **sem desconto**. Total mensal = honorário +
  serviços mensais; total único = serviços únicos.
- **Isto muda o motor:** hoje os serviços mensais entram no recorrente antes do desconto; passam a entrar
  **depois** do desconto e do piso. A calculadora (Fatia B) reflete a mesma correção — os números batem com
  a proposta.
- **Snapshot:** `proposta.precificacao jsonb` guarda `{ params, mensal, unico, detalhamento }`. Só é gravado
  quando o usuário calcula; um save normal da proposta **não** apaga o snapshot.
- **Itens:** o editor guarda os itens em estado no cliente e salva tudo via `salvarProposta`; a integração
  **acrescenta** os itens gerados a esse estado (o usuário revê e salva).
- **Gate:** o do editor de proposta (comercial), inalterado.
- **Migration idempotente**; aplicar com `npm run db:migrate`; **migration em produção antes do deploy**.
- **`main` protegido:** PR `develop → main`, `verify` verde. Release com bump + CHANGELOG. Deploy manual.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/comercial/precificacao.ts` | **Modificar** — serviços depois do desconto/piso; + `itensProposta` | 1 |
| `src/tests/comercial/precificacao.test.ts` | **Modificar** — números novos + testes de `itensProposta` | 1 |
| `supabase/migrations/0104_proposta_precificacao.sql` | **Criar** — coluna `precificacao jsonb` | 2 |
| `src/app/(app)/comercial/propostas-actions.ts` | **Modificar** — `salvarProposta` aceita `precificacao` | 2 |
| `src/app/(app)/comercial/precificacao/Calculadora.tsx` | **Modificar** — prop opcional `onUsar` | 3 |
| `src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx` | **Modificar** — botão + modal + acrescentar itens | 3 |
| `src/app/(app)/comercial/propostas/[id]/page.tsx` | **Modificar** — carregar config e passar à calculadora | 3 |
| `CHANGELOG.md` + `package.json` | **Modificar** — release 6.16.0 | 4 |

---

### Task 1: Motor — desconto só no honorário + `itensProposta`

**Files:**
- Modify: `src/lib/comercial/precificacao.ts`
- Test: `src/tests/comercial/precificacao.test.ts`

**Interfaces:**
- Muda o comportamento de `calcularHonorario` (serviços mensais somam **depois** do desconto e do piso).
- Produces:
  - `type ItemProposta = { descricao: string; valor: number; recorrencia: "mensal" | "unico" }`
  - `type ServicoView = { id: string; nome: string; valor: number; recorrencia: "mensal" | "unico" }`
  - `type SnapshotPreco = { params: Parametros; mensal: number; unico: number; detalhamento: Linha[] }`
  - `itensProposta(p: Parametros, cfg: ConfigPreco, servicos: ServicoView[]): { itens: ItemProposta[]; snapshot: SnapshotPreco }`

- [ ] **Step 1: Ajustar os testes do motor (números novos) e adicionar `itensProposta`**

No `precificacao.test.ts`, o 1º caso de `calcularHonorario` muda (serviços depois do desconto):
```ts
it("compõe base + acréscimos × complexidade − desconto (só no honorário) + serviços depois", () => {
  const r = calcularHonorario(
    { regime: "Simples", faturamento: 120000, funcionarios: 8, notas: 0, complexidadeId: "media", servicoIds: ["folha", "abertura"], descontoPct: 10 },
    cfg,
  );
  // base 500 + fat 150 + func 75 = 725; ×1.2 = 870; desconto 10% = 87 → 783; piso 400 ok;
  // + folha 200 (depois, sem desconto) = 983. unico = 900.
  expect(r.mensal).toBeCloseTo(983);
  expect(r.unico).toBeCloseTo(900);
});
```
(Os outros dois casos de `calcularHonorario` — teto/piso e regime sem base — seguem com os mesmos números,
pois não têm serviço mensal.) Acrescentar o bloco de `itensProposta`:
```ts
import { itensProposta } from "@/lib/comercial/precificacao";

describe("itensProposta", () => {
  const servicos = [
    { id: "folha", nome: "Folha", valor: 200, recorrencia: "mensal" as const },
    { id: "abertura", nome: "Abertura", valor: 900, recorrencia: "unico" as const },
  ];
  it("gera o honorário consolidado (com desconto) + uma linha por serviço", () => {
    const { itens, snapshot } = itensProposta(
      { regime: "Simples", faturamento: 120000, funcionarios: 8, notas: 0, complexidadeId: "media", servicoIds: ["folha", "abertura"], descontoPct: 10 },
      cfg,
      servicos,
    );
    // honorário (sem serviços) = 725×1.2=870; −10% = 783; piso 400 ok.
    expect(itens[0]).toEqual({ descricao: "Honorários contábeis", valor: 783, recorrencia: "mensal" });
    expect(itens).toContainEqual({ descricao: "Folha", valor: 200, recorrencia: "mensal" });
    expect(itens).toContainEqual({ descricao: "Abertura", valor: 900, recorrencia: "unico" });
    expect(snapshot.mensal).toBeCloseTo(983); // honorário + serviços mensais
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: FAIL — o mensal atual é 963 (não 983) e `itensProposta` não existe.

- [ ] **Step 3: Ajustar `calcularHonorario` (serviços depois do desconto/piso)**

Substituir, em `calcularHonorario`, o trecho que hoje soma serviços mensais **antes** do desconto por esta
ordem — recorrente (base+acréscimos×complexidade) → desconto → piso → **então** serviços mensais:
```ts
  const mult = multiplicador(cfg.complexidades, p.complexidadeId);
  const subtotal = base + aFat + aFunc + aNotas;
  let recorrente = subtotal * mult;
  if (mult !== 1) det.push({ rotulo: `Complexidade (×${mult})`, valor: recorrente - subtotal });

  const pct = Math.min(p.descontoPct, cfg.descontoMaximoPct);
  const desconto = recorrente * (pct / 100);
  if (desconto) det.push({ rotulo: `Desconto (${pct}%)`, valor: -desconto });
  recorrente -= desconto;

  let mensal = Math.max(cfg.valorMinimo, recorrente);
  if (mensal !== recorrente) det.push({ rotulo: "Piso aplicado", valor: mensal - recorrente });

  const marcados = cfg.servicos.filter((s) => p.servicoIds.includes(s.id));
  for (const s of marcados.filter((s) => s.recorrencia === "mensal")) {
    mensal += s.valor;
    det.push({ rotulo: "Serviço (mensal)", valor: s.valor });
  }
  const unico = marcados.filter((s) => s.recorrencia === "unico").reduce((t, s) => t + s.valor, 0);

  return { mensal, unico, detalhamento: det };
```
(Remover o bloco antigo que somava serviços mensais em `recorrente` antes do desconto.)

- [ ] **Step 4: Implementar `itensProposta`**

Acrescentar ao fim de `precificacao.ts`:
```ts
export type ItemProposta = { descricao: string; valor: number; recorrencia: "mensal" | "unico" };
export type ServicoView = { id: string; nome: string; valor: number; recorrencia: "mensal" | "unico" };
export type SnapshotPreco = { params: Parametros; mensal: number; unico: number; detalhamento: Linha[] };

// Transforma um cálculo nos itens da proposta: o honorário consolidado (com desconto, sem serviços) +
// uma linha por serviço marcado (valor de tabela, sem desconto). O snapshot guarda o cálculo cheio.
export function itensProposta(
  p: Parametros,
  cfg: ConfigPreco,
  servicos: ServicoView[],
): { itens: ItemProposta[]; snapshot: SnapshotPreco } {
  const honorario = calcularHonorario({ ...p, servicoIds: [] }, cfg).mensal; // honorário sem serviços
  const cheio = calcularHonorario(p, cfg); // mensal/unico/detalhamento com serviços (para o snapshot)
  const itens: ItemProposta[] = [{ descricao: "Honorários contábeis", valor: honorario, recorrencia: "mensal" }];
  for (const s of servicos.filter((s) => p.servicoIds.includes(s.id))) {
    itens.push({ descricao: s.nome, valor: s.valor, recorrencia: s.recorrencia });
  }
  return { itens, snapshot: { params: p, mensal: cheio.mensal, unico: cheio.unico, detalhamento: cheio.detalhamento } };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/comercial/precificacao.test.ts`
Expected: PASS. Conferir também `src/tests/comercial/calculadora-render.test.tsx` (não deve quebrar —
só o número muda, não o markup).

- [ ] **Step 6: Commit**

```bash
git add src/lib/comercial/precificacao.ts src/tests/comercial/precificacao.test.ts
git commit -m "feat(comercial): desconto so no honorario + itensProposta (serviços como linhas)"
```

---

### Task 2: Migration do snapshot + `salvarProposta`

**Files:**
- Create: `supabase/migrations/0104_proposta_precificacao.sql`
- Modify: `src/app/(app)/comercial/propostas-actions.ts`

**Interfaces:**
- Produces: coluna `proposta.precificacao jsonb`; `salvarProposta` aceita `precificacao?` opcional.

- [ ] **Step 1: Migration**

```sql
-- RF-003 Fatia C: snapshot do cálculo de precificação na proposta.
alter table proposta add column if not exists precificacao jsonb;
```

- [ ] **Step 2: Aplicar no dev**

Run: `npm run db:migrate`
Expected: aplica `0104`.

- [ ] **Step 3: `salvarProposta` aceita o snapshot**

Em `propostas-actions.ts`, estender a assinatura e o update (só grava quando `precificacao` vier — um save
normal não apaga o snapshot):
```ts
export async function salvarProposta(
  id: string,
  dados: {
    validade: string | null;
    observacoes: string | null;
    itens: ItemInput[];
    responsavel: Responsavel;
    precificacao?: unknown;
  },
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = {
    validade: dados.validade,
    observacoes: dados.observacoes,
    responsavel_nome: dados.responsavel.nome,
    responsavel_email: dados.responsavel.email,
    responsavel_telefone: dados.responsavel.telefone,
    atualizado_em: new Date().toISOString(),
  };
  if (dados.precificacao !== undefined) patch.precificacao = dados.precificacao;
  const { error: e1 } = await supabase.from("proposta").update(patch).eq("id", id);
  // ...resto (delete + insert de proposta_item) inalterado...
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: limpo (o `EditorProposta` ainda não passa `precificacao` — opcional, então compila).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0104_proposta_precificacao.sql "src/app/(app)/comercial/propostas-actions.ts"
git commit -m "feat(comercial): snapshot de precificacao na proposta (coluna + salvarProposta)"
```

---

### Task 3: Botão "Calcular honorários" no editor

**Files:**
- Modify: `src/app/(app)/comercial/precificacao/Calculadora.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/EditorProposta.tsx`
- Modify: `src/app/(app)/comercial/propostas/[id]/page.tsx`

**Interfaces:**
- Consumes: `itensProposta` (Task 1), `carregarPrecificacao`/`paraConfigPreco`, `salvarProposta` com
  `precificacao`.
- Produces: no editor, um botão que abre a calculadora e, ao confirmar, acrescenta os itens e prepara o
  snapshot.

- [ ] **Step 1: `Calculadora` ganha `onUsar` opcional**

Adicionar à `Calculadora` a prop `onUsar?: (params: Parametros, servicos: ServicoView[]) => void`. Quando
presente, renderizar um botão **"Usar na proposta"** que chama
`onUsar({ regime, faturamento, funcionarios, notas, complexidadeId, servicoIds, descontoPct }, servicos)`
(passa os `servicos` recebidos por prop, já com nome/valor/recorrência, para o chamador montar os itens via
`itensProposta`). Sem `onUsar` (uso avulso), nada muda.

> `servicos` já é prop da `Calculadora`; tipar como `ServicoView[]` (id/nome/valor/recorrência) para casar
> com `itensProposta`. A página avulsa passa `recorrencia` como `"mensal"|"unico"` (a de config é string —
> mapear no `page.tsx` avulso: `recorrencia: s.recorrencia === "mensal" ? "mensal" : "unico"`).

- [ ] **Step 2: `[id]/page.tsx` carrega a config e passa ao editor**

Na página do editor da proposta, carregar `carregarPrecificacao()` → `paraConfigPreco`, e os `servicos`
ativos, e passar `config` + `servicos` ao `EditorProposta` (novas props).

- [ ] **Step 3: `EditorProposta` — botão + modal + acrescentar itens**

- Novas props: `config: ConfigPreco`, `servicos: ServicoView[]`.
- Estado: `calcAberta` (bool), `snapshot` (SnapshotPreco | null, default null).
- Botão **"Calcular honorários"** (perto de "Salvar"/itens) → `setCalcAberta(true)`.
- Modal com a `<Calculadora config={config} complexidades={…} servicos={servicos} onUsar={aplicar} />`
  (as `complexidades` também vêm da config; carregá-las no `page.tsx` e passar). `aplicar(params, servicos)`:
  ```ts
  const { itens: novos, snapshot } = itensProposta(params, config, servicos);
  setItens((atual) => {
    const limpos = atual.filter((i) => i.descricao.trim()); // tira a linha vazia inicial
    return [...limpos, ...novos.map((n) => ({ descricao: n.descricao, valor: n.valor, recorrencia: n.recorrencia }))];
  });
  setSnapshot(snapshot);
  setCalcAberta(false);
  ```
- `salvar()` passa o snapshot: `salvarProposta(proposta.id, { …, precificacao: snapshot ?? undefined })`.
- Fechar o modal sem usar não altera itens.

> Reusar o padrão de modal do `QuadroComercial` (overlay `fixed inset-0 … bg-black/30`). O botão "Usar na
> proposta" fica dentro da `Calculadora` (via `onUsar`); o "Fechar" fica no modal do editor.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npx vitest run` (a suíte inteira; conferir que
`calculadora-render` e os testes de proposta seguem verdes).
Expected: limpo + PASS.

- [ ] **Step 5: Conferência na tela** — `npm run dev`: em `/configuracoes/precificacao` preencher a config;
  abrir uma proposta em `/comercial/propostas/<id>`, clicar **Calcular honorários**, calcular, **Usar na
  proposta** → os itens aparecem (honorário + serviços); **Salvar**; reabrir e conferir que os itens
  persistiram. **Mostrar ao Pedro.**

- [ ] **Step 6: `format` e commit**

```bash
npm run format
git add -A
git commit -m "feat(comercial): calcular honorarios na proposta (itens + snapshot)"
```

---

### Task 4: Release 6.16.0

**Files:** `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Verificação completa**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 2: Bump + CHANGELOG**

- `package.json`: `6.15.0` → `6.16.0`.
- `CHANGELOG.md`: `## [6.16.0] — <data>` com `### Adicionado` (calcular honorários na proposta: itens +
  snapshot) e `### Mudado` (o desconto passou a incidir só no honorário; serviços entram depois, sem
  desconto — a calculadora reflete). **Fecha a RF-003.**
- Conferir `npx vitest run src/tests/versao.test.ts`.

- [ ] **Step 3: PR**

```bash
git push origin develop
gh pr create --base main --head develop --title "RF-003 fatia C: calcular honorários na proposta (v6.16.0)"
gh pr checks --watch
```

- [ ] **Step 4: Release (com o Pedro)**

> **Migration `0104` em produção antes do deploy.** Sequência: migration → merge → Implantar → confirmar
> `6.16.0` no `/api/health` → tag.

## Self-Review (cobertura da spec)

- Botão "Calcular honorários" no editor → Task 3.
- Item consolidado + serviços como itens próprios → `itensProposta` (Task 1) + Task 3.
- Snapshot na proposta → Task 2 (coluna) + Task 3 (grava no save).
- Desconto/serviços conforme a decisão do Pedro (desconto só no honorário) → Task 1 (motor ajustado +
  testes atualizados). A calculadora avulsa reflete a mesma regra.
- Fecha a RF-003 (as três fatias entregues).
