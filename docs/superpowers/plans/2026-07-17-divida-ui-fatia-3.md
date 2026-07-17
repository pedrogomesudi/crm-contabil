# Fatia 3 — Dívida de UI — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-17-divida-ui-fatia-3-design.md`.

**Objetivo:** fechar o brand kit (53 `amber` → tokens), matar o `<main>` aninhado de 62 telas migrando-as
ao `Container`, e deixar um só padrão de voltar — com um teste que impede as três dívidas de voltarem.

**Arquitetura:** três entregas independentes, cada uma um commit. Nenhuma muda comportamento; todas são
re-skin. O teste de dívida (Tarefa 4) é o que sustenta o resultado no tempo.

**Stack:** Next.js 16 (App Router), Tailwind 4 (CSS-first, `@theme`), TypeScript, vitest.

## Restrições globais

- **Tokens aditivos:** nenhum valor existente do `@theme` (`globals.css:5-30`) muda.
- **Nada de comportamento:** `name`/`value`/`onChange`/`action`, `aria-*`, `role` e labels são preservados.
  Isto é re-skin (`docs/design/saldo-ui.md`).
- **O `inputCls` está FORA desta fatia** — são 28 ocorrências com naturezas diferentes (5 sem `w-full`, 13
  com margem própria, 1 que nem é input). Vira spec própria. **Não** mexa nele aqui.
- **O portal (`src/app/(portal)/**`) fica fora:** o `<main>` dele está no layout próprio e **não** está
  aninhado. Medido.
- **A régua** (do `saldo-ui.md`): `max-w-[720px] → estreita` · `max-w-[1280px] → padrao` · `max-w-full` ou
  sem `max-w` → `larga`.
- `npm run lint && npm run typecheck && npm test && npm run format:check` antes de cada commit.
- O `main` é protegido: entrega por PR.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/globals.css` (modificar) | + `--color-atencao-borda`, `--color-atencao-solido` |
| 24 arquivos com `amber-` (modificar) | migram para os tokens |
| 62 telas de `src/app/(app)/**` (modificar) | `<main>` → `<Container>` |
| 22 telas (modificar) | "← voltar" → `<Voltar>` |
| `src/tests/ui/divida-ui.test.ts` (criar) | trava as três dívidas |

---

### Tarefa 1: Fechar o conjunto `atencao`

Os 9 shades de `amber` servem 3 papéis: aviso (16 usos), borda (4) e bolinha de status (2).

**Files:**
- Modify: `src/app/globals.css` (bloco `@theme`, depois da linha 22)
- Modify: os 24 arquivos com `amber-`
- Test: `src/tests/ui/divida-ui.test.ts` (criado na Tarefa 4 — aqui só a migração)

**Interfaces:**
- Produces: classes `border-atencao-borda`, `bg-atencao-solido` (o Tailwind gera a partir do `@theme`).

- [ ] **Step 1: Adicionar os dois tokens (aditivo)**

Em `src/app/globals.css`, logo abaixo de `--color-atencao-fundo: #fdf3e0;`:

```css
  /* Borda e sólido do mesmo papel "atenção": o amber servia 3 papéis com 9 shades.
     A borda unifica amber-200/300/400; o sólido é a bolinha de status ("em constituição"). */
  --color-atencao-borda: #e8d5a8;
  --color-atencao-solido: #c88a04;
```

- [ ] **Step 2: Medir o contraste do sólido (não presumir)**

O `atencao-solido` é bolinha, não texto — não exige AA de texto. Mas confirme que ele se distingue do
fundo creme (`#f7f6f2`), senão a bolinha some:

```bash
node -e '
const lum = (h) => { const c = h.match(/\w\w/g).map(x => { const v = parseInt(x,16)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const razao = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((m,n) => n-m); return ((x+0.05)/(y+0.05)).toFixed(2); };
console.log("solido sobre creme:", razao("c88a04","f7f6f2"), "(>= 3 para elemento gráfico, WCAG 1.4.11)");
console.log("texto atencao sobre fundo atencao:", razao("8a5a00","fdf3e0"), "(>= 4.5 para texto)");
'
```
Expected: sólido **≥ 3** e texto **≥ 4.5**. Se o sólido ficar abaixo, escureça `--color-atencao-solido`.

- [ ] **Step 3: Migrar os 53 usos**

```bash
python3 - <<'PY'
import io, glob, re
MAPA = [
    (r'\bbg-amber-(?:50|100)\b', 'bg-atencao-fundo'),
    (r'\btext-amber-(?:700|800|900)\b', 'text-atencao'),
    (r'\bborder-amber-(?:200|300|400)\b', 'border-atencao-borda'),
    (r'\bbg-amber-500\b', 'bg-atencao-solido'),
]
mudados = 0
for p in glob.glob("src/**/*.tsx", recursive=True) + glob.glob("src/**/*.ts", recursive=True):
    s = io.open(p, encoding="utf-8").read()
    novo = s
    for padrao, token in MAPA:
        novo = re.sub(padrao, token, novo)
    if novo != s:
        io.open(p, "w", encoding="utf-8").write(novo)
        mudados += 1
print(f"arquivos migrados: {mudados}")
PY
grep -rn "amber-" src/ | grep -v "\.md:" || echo "nenhum amber restante"
```
Expected: `arquivos migrados: 24` e **nenhum amber restante**. Se sobrar algum shade não mapeado, ele
aparece no grep: decida o papel dele (aviso/borda/sólido) e mapeie — **não** invente token novo.

- [ ] **Step 4: Verificar e commitar**

```bash
npm run lint && npm run typecheck && npm test && npx prettier --write src/ && npm run format:check
git add -A
git commit -m "feat(ui): fecha o conjunto atencao — os 53 amber viram token"
```
Expected: 684 testes verdes.

---

### Tarefa 2: `<main>` aninhado → `Container`

62 telas têm `<main>` dentro do `<main id="conteudo">` do layout (`(app)/layout.tsx:48`) — landmark
duplicado. As mesmas linhas carregam o `max-w-*` inline que a Fatia 1 não migrou.

**Files:**
- Modify: 62 telas de `src/app/(app)/**/page.tsx`
- Modify: `src/components/financeiro/CadastroCrud.tsx` — é **componente**, mas renderiza `<main>` (o
  script varre `src/app`, então este escapa se não for citado). O `AuthCard.tsx` também tem `<main>` e
  **fica como está**: é o login, fora do layout do app — ali o `<main>` é o único da página, legítimo.

**Interfaces:**
- Consumes: `<Container largura?: "estreita" | "padrao" | "larga">` de `@/components/ui/Container`.

- [ ] **Step 1: Ver a distribuição real antes de mexer**

```bash
grep -rhoE '<main className="[^"]*"' "src/app/(app)" | sed 's/<main className="//;s/"$//' | sort | uniq -c | sort -rn
```
Expected: as formas dominantes são `mx-auto max-w-[720px] space-y-5 p-4` (24), `max-w-[1280px] …` (22) e
`max-w-full …` (5). **Leia a lista**: se aparecer uma forma que não é `mx-auto max-w-* space-y-* p-*`,
trate-a à mão no Step 3.

- [ ] **Step 2: Migrar**

O `Container` dá a régua e o `mx-auto`; o `space-y-*`/`p-*` fica no filho.

```bash
python3 - <<'PY'
import io, glob, re

REGUA = {"max-w-[720px]": "estreita", "max-w-[1280px]": "padrao", "max-w-full": "larga"}
alvo = re.compile(r'<main className="mx-auto (max-w-\[720px\]|max-w-\[1280px\]|max-w-full) ([^"]*)">')
mudados = 0
ALVOS = glob.glob("src/app/(app)/**/*.tsx", recursive=True) + ["src/components/financeiro/CadastroCrud.tsx"]
for p in ALVOS:
    s = io.open(p, encoding="utf-8").read()
    if "<main" not in s:
        continue
    def troca(m):
        largura, resto = REGUA[m.group(1)], m.group(2)
        return f'<Container largura="{largura}">\n      <div className="{resto}">'
    novo, n = alvo.subn(troca, s)
    if n == 0:
        continue
    # fecha: o </main> vira </div></Container>
    novo = novo.replace("</main>", "</div>\n    </Container>")
    if "components/ui/Container" not in novo:
        # coloca o import depois do último import existente
        linhas = novo.split("\n")
        ultimo = max(i for i, l in enumerate(linhas) if l.startswith("import "))
        linhas.insert(ultimo + 1, 'import { Container } from "@/components/ui/Container";')
        novo = "\n".join(linhas)
    io.open(p, "w", encoding="utf-8").write(novo)
    mudados += 1
print(f"telas migradas: {mudados}")
PY
```

- [ ] **Step 3: Achar o que o script não pegou**

```bash
grep -rn "<main" "src/app/(app)" src/components | grep -v layout.tsx | grep -v AuthCard
```
Expected: **vazio**. O que sobrar tem forma fora do padrão (ex.: `space-y-6 p-6`): migre à mão, usando a
régua do `saldo-ui.md`. Os dois `<main>` legítimos são o do `(app)/layout.tsx` e o do `AuthCard.tsx`
(login, fora do layout do app).

- [ ] **Step 4: Verificar**

```bash
npx prettier --write "src/app/(app)" && npm run lint && npm run typecheck && npm test && npm run build
```
Expected: 684 testes verdes e build limpo. **Se algum teste de render quebrar**, leia: provavelmente ele
buscava `<main>` — atualize a asserção (o `<main>` saiu de propósito), não recrie a tag.

- [ ] **Step 5: Conferir uma tela de pé**

```bash
npm run dev > /tmp/f3.log 2>&1 &
sleep 10
curl -s -o /dev/null -w "clientes: http=%{http_code}\n" http://localhost:3000/clientes
curl -s -o /dev/null -w "config:   http=%{http_code}\n" http://localhost:3000/configuracoes
kill %1
```
Expected: 200 (logado) ou 307 (sem sessão). **500 significa JSX quebrado** pelo script — investigue antes
de commitar.

- [ ] **Step 6: Commitar**

```bash
git add -A
git commit -m "fix(a11y): o <main> aninhado de 62 telas vira Container

Landmark duplicado: o leitor de tela anunciava 'principal' duas vezes. As mesmas
linhas carregavam o max-w inline — agora a regua e o Container, como o guia manda."
```

---

### Tarefa 3: Um só padrão de voltar

14 telas usam `<Voltar>`; 22 usam um link "← texto" solto (`text-sm text-verde underline`).

**Files:**
- Modify: as 22 telas com `←`

**Interfaces:**
- Consumes: `<Voltar href label?>` de `@/components/ui/Voltar` — `label` default `"Voltar"`.

- [ ] **Step 1: Listar os 22 casos e o texto de cada um**

```bash
grep -rn "←" "src/app/(app)" | sed 's/^\(.\{110\}\).*/\1…/'
```
**Leia a lista.** Há dois tipos: texto fixo (`← Comunicados`) e contextual (`← {cli?.razao_social}`). O
contextual vira `label={...}` — não perca o dado.

- [ ] **Step 2: Trocar, um a um**

Não há script seguro aqui: cada caso tem um `href` e um texto próprios, e alguns interpolam variável.
Para cada ocorrência, troque:

```tsx
// antes
<Link href="/comunicados" className="text-sm text-verde underline">
  ← Comunicados
</Link>

// depois
<Voltar href="/comunicados" label="Comunicados" />
```

E no caso contextual:

```tsx
// antes
<Link href={`/clientes/${id}`} className="text-sm text-verde underline">
  ← {(cli?.razao_social as string) ?? "Cliente"}
</Link>

// depois
<Voltar href={`/clientes/${id}`} label={(cli?.razao_social as string) ?? "Cliente"} />
```

Import: `import { Voltar } from "@/components/ui/Voltar";`. Remova o `import Link` se ele ficar órfão —
o `typecheck` acusa (`TS6133`).

- [ ] **Step 3: Confirmar que não sobrou nenhum**

```bash
grep -rn "←" "src/app/(app)" || echo "nenhum '←' restante"
npm run lint && npm run typecheck && npm test
```
Expected: nenhum `←`; 684 testes verdes.

- [ ] **Step 4: Commitar**

```bash
npx prettier --write "src/app/(app)"
git add -A
git commit -m "refactor(ui): um so padrao de voltar — 22 links soltos viram <Voltar>"
```

---

### Tarefa 4: O teste que impede a dívida de voltar

**Files:**
- Create: `src/tests/ui/divida-ui.test.ts`

- [ ] **Step 1: Escrever o teste**

```ts
// src/tests/ui/divida-ui.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

// As três dívidas desta fatia nasceram porque nada verificava: 9 shades de amber para 3
// papéis, 62 telas com <main> aninhado, dois padrões de voltar. Este teste é o que impede
// cada uma de voltar sozinha.
const RAIZ = resolve(process.cwd(), "src");

const arquivos = (dir: string): string[] => {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
};

const rel = (p: string) => p.slice(p.indexOf("src/"));
const codigo = arquivos(RAIZ).filter((p) => !p.includes("/tests/"));

describe("dívida de UI não volta", () => {
  it("nenhum amber do Tailwind — a marca tem o token `atencao`", () => {
    const culpados = codigo.filter((p) => /\bamber-\d/.test(readFileSync(p, "utf8"))).map(rel);
    expect(culpados).toEqual([]);
  });

  it("só o layout tem <main> — o resto usa Container (landmark duplicado é bug de a11y)", () => {
    const culpados = codigo
      .filter((p) => p.includes("/app/") && !p.endsWith("layout.tsx"))
      .filter((p) => /<main[\s>]/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(culpados).toEqual([]);
  });

  it("nenhum '←' solto — o voltar é o <Voltar>", () => {
    const culpados = codigo.filter((p) => readFileSync(p, "utf8").includes("←")).map(rel);
    expect(culpados).toEqual([]);
  });

  // A régua (720/1280/full) é do Container. Modal, bolha de chat e página de impressão têm
  // largura própria, que não é régua de tela — por isso a regra mira só os valores da régua,
  // e não "qualquer max-w".
  it("nenhuma régua inline: largura de tela vem do Container", () => {
    const REGUA = /max-w-(\[720px\]|\[1280px\]|full)/;
    const culpados = codigo
      .filter((p) => !p.includes("/components/ui/")) // os primitivos são a régua
      .filter((p) => !p.includes("/documento/")) // impressão: a largura é do papel
      .filter((p) => REGUA.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(culpados).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run src/tests/ui/divida-ui`
Expected: 4 PASS. **Se algum falhar, ele lista os arquivos** — cada um é dívida que escapou das tarefas
1-3. Corrija o arquivo. **Não** relaxe o teste para ele passar; a única exceção legítima é largura de
impressão/modal, que já está prevista.

- [ ] **Step 3: Provar que cada guarda morde**

Um teste que nunca falhou não é guarda. Sabote e confirme:

```bash
# 1) amber
sed -i '' 's/bg-atencao-fundo/bg-amber-100/' src/components/ui/Badge.tsx
npx vitest run src/tests/ui/divida-ui 2>&1 | grep -E "Badge|Tests "
sed -i '' 's/bg-amber-100/bg-atencao-fundo/' src/components/ui/Badge.tsx

# 2) main aninhado
mkdir -p "src/app/(app)/zz-teste" && printf 'export default function Z() {\n  return <main>x</main>;\n}\n' > "src/app/(app)/zz-teste/page.tsx"
npx vitest run src/tests/ui/divida-ui 2>&1 | grep -E "zz-teste|Tests "
rm -rf "src/app/(app)/zz-teste"

npx vitest run src/tests/ui/divida-ui 2>&1 | grep "Tests "
```
Expected: cada sabotagem faz o teste **falhar apontando o arquivo**; no fim, 4 PASS de novo. Confirme
`git status --porcelain` limpo antes de seguir.

- [ ] **Step 4: Commitar**

```bash
npx prettier --write src/tests/ui/divida-ui.test.ts
git add src/tests/ui/divida-ui.test.ts
git commit -m "test(ui): trava as tres dividas — amber, main aninhado e o voltar solto"
```

---

### Tarefa 5: Documentar e entregar

**Files:**
- Modify: `docs/design/saldo-ui.md`, `CHANGELOG.md`

- [ ] **Step 1: O guia**

Em `docs/design/saldo-ui.md`, no mapa de tokens, troque a linha do `amber` (que hoje diz "restam ~55
ocorrências a migrar") por:

```markdown
`bg-amber-*/text-amber-*→bg-atencao-fundo/text-atencao` · `border-amber-*→border-atencao-borda` ·
`bg-amber-500→bg-atencao-solido` — **o amber saiu do sistema** (`src/tests/ui/divida-ui.test.ts` falha se
voltar). O conjunto `atencao` tem 4 tokens para 3 papéis: aviso, borda e bolinha de status.
```

E na seção de largura, remova a ressalva "As telas migradas ainda usam `max-w-[720px]` inline" — deixou de
ser verdade. Acrescente: **o `<main>` é só do layout; tela usa `Container`.**

- [ ] **Step 2: CHANGELOG**

Em `[Não lançado]`, no bloco do redesign, acrescente a fatia 3: o `amber` saiu (53 usos, 9 shades → 4
tokens); o `<main>` aninhado de 62 telas virou `Container` (landmark duplicado, WCAG); 22 links "←"
viraram `<Voltar>`; e o teste que trava as três. Registre que o `inputCls` ficou de fora, com o motivo.

- [ ] **Step 3: Entregar**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npx prettier --write docs/ CHANGELOG.md && npm run format:check
git add -A && git commit -m "docs: o amber saiu do sistema; main so no layout"
git push origin develop
gh pr create --base main --head develop --title "fix(ui): fatia 3 — divida de UI (amber, main aninhado, voltar)"
gh pr checks --watch
gh pr merge --merge
```

---

## Encerramento

- [ ] **Avaliação humana:** peça ao Pedro que confira uma tela de aviso (o `amber` virou `atencao` — o tom
      muda um pouco, porque dois fundos viraram um) e uma tela de detalhe (o "← voltar" virou botão).
- [ ] Fatia 4 (se houver): o **`inputCls`** — 28 ocorrências, 5 sem `w-full`, 13 com margem própria e 1 que
      nem é input (`Inbox.tsx`). Precisa de spec própria e decisão por tela.
