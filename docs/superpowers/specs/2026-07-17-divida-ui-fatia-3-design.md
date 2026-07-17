# Redesign — Fatia 3: dívida de UI — Design

**O que é:** a limpeza que as fatias 1 e 2 deixaram registrada. Não há design novo — há três dívidas
medidas, cada uma com uma entrega independente.

## O diagnóstico (medido hoje, não herdado)

| Dívida | Real | Efeito |
|---|---|---|
| **`amber` fora do brand** | **53 ocorrências · 9 shades · 24 arquivos** | Visível: cores que não são da marca. |
| **`<main>` aninhado** | **62 telas** com `<main>` dentro do `<main>` do layout (`(app)/layout.tsx:48`) | Landmark duplicado (WCAG): o leitor de tela anuncia "principal" duas vezes. |
| **Dois padrões de voltar** | 14 telas com `<Voltar>` · **22 com "← voltar"** solto | Visível: dois estilos para a mesma ação. |

**Os 9 shades servem só 3 papéis** (medido, não estimado):

| Papel | Hoje | Usos |
|---|---|---|
| Aviso (caixa de "atenção, leia isto") | `bg-amber-50` **ou** `bg-amber-100` + `text-amber-800` | 16 |
| Borda de aviso | `border-amber-200` / `300` / `400` | 4 |
| Bolinha de status ("em constituição") | `bg-amber-500` | 2 |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Tokens de atenção | **4 no total**: `atencao` (texto) + `atencao-fundo` (já existem) + **`atencao-borda`** + **`atencao-solido`** | Cobre os 3 papéis reais. Os dois fundos (`amber-50` e `amber-100`) **colapsam num só**: fazem o mesmo trabalho e a diferença é quase imperceptível. |
| `<main>` aninhado | **Vira `<Container>`**, não `<div>` | Conserta o landmark **e** mata o `max-w-*` inline na mesma linha — fechando a promessa da Fatia 1 ("a régua é o `Container`; nada de `max-w` solto"). Fazer separado seria tocar 62 telas duas vezes. |
| Padrão de voltar | **`<Voltar>` vence** | É componente, tem o estilo do botão secundário e aceita `label` — os contextuais ("← Comunicados", "← nome do cliente") sobrevivem como `label`. |
| **`inputCls`** | **FORA desta fatia** | Ver abaixo. |

### Por que o `inputCls` saiu (a descoberta que mudou a decisão)

O registro dizia "~10 cópias divergentes". A medição real: **28 ocorrências**, e as divergências têm
naturezas diferentes:

- **5 não têm `w-full`** (`usuarios/page.tsx` ×3, `AlertasView`, `FormCertificado`, `FormProcuracao`,
  `EmitirNfseCliente`) — unificar faria esses campos ocuparem a **largura inteira**. Mudança visual grande,
  em telas que ninguém pediu para mexer.
- **13 têm `mt-1`/`mt-0.5`** (só o `EmitenteConfig` tem 12) — perderiam a margem sem tratamento caso a caso.
- **4 não têm `focus:border-verde`** — ganhariam foco visível (isso é acessibilidade, e é bom).
- **1 nem é input:** no `Inbox.tsx` a string tem `flex gap-2 items-center` — é um **container** que por
  coincidência carrega classes parecidas. Unificar ali seria erro.

É o único item que muda aparência sem que o ganho apareça para quem usa. Vira **spec própria**, com a
lista das 28 e o que muda em cada uma — a decisão é por tela, e é do humano.

## Arquitetura

### Entrega 1 — tokens de atenção

- `src/app/globals.css` (`@theme`): + `--color-atencao-borda`, `--color-atencao-solido`. **Aditivo**:
  nenhum valor existente muda.
- Os 53 `amber` migram: `bg-amber-50|100 → bg-atencao-fundo` · `text-amber-700|800|900 → text-atencao` ·
  `border-amber-200|300|400 → border-atencao-borda` · `bg-amber-500 → bg-atencao-solido`.
- **Contraste medido**, não presumido (o token original deu 5.38; AA exige 4.5).

### Entrega 2 — `<main>` → `<Container>`

- 62 telas de `src/app/(app)/**`. O mapa já está no `saldo-ui.md`:
  `max-w-[720px] → largura="estreita"` · `max-w-[1280px] → "padrao"` · `max-w-full` ou sem `max-w` → `"larga"`.
- O `<main id="conteudo">` do layout **continua sendo o único** `<main>` da página.
- `space-y-*` e `p-4` das telas são preservados no filho — o `Container` só dá régua.

### Entrega 3 — `<Voltar>` único

- 22 telas trocam o link "← texto" por `<Voltar href label>`.
- Onde o texto é contextual (`← {razao_social}`), vira `label={razaoSocial}`.

### Fora de escopo

`inputCls` (spec própria); o portal do cliente (`(portal)/**` tem `<main>` próprio e **não** está aninhado
— é layout separado); ícones no menu; qualquer mudança de comportamento.

## Verificação

- **O teste que trava a dívida** (`src/tests/ui/divida-ui.test.ts`): falha se voltar a aparecer, em
  `src/app/(app)/**` ou `src/components/**`:
  - qualquer `amber-`
  - `<main` fora do `layout.tsx`
  - `max-w-` fora dos componentes de `ui/`
  - `←` como link de voltar
  Sem isso a dívida volta: foi assim que nasceram 9 shades e 5 padrões de navegação.
- **Contraste AA** dos tokens novos, calculado.
- **Não-regressão:** 684 testes verdes; `lint`, `typecheck`, `build`, `format:check` limpos.
- **Visual:** o Pedro confere as telas de aviso (amber → atencao) e alguma tela de detalhe (voltar).

## Riscos

| Risco | Mitigação |
|---|---|
| O `amber-50` e o `amber-100` colapsarem num fundo só muda o tom de 16 caixas | É o objetivo (dois fundos para o mesmo papel). A diferença entre os dois é quase imperceptível; o Pedro confere. |
| Trocar `<main>` por `<Container>` em 62 telas quebrar layout | O `Container` é `<div>` com a mesma régua; `space-y`/`p-4` são preservados. Build + 684 testes + conferência visual. |
| `<Voltar>` mudar o peso visual do link (era texto verde, vira botão secundário) | É o padrão que 14 telas já usam. Se destoar em alguma, ajusta-se ali. |
| O teste de dívida virar chato (falso positivo) | Ele lista exceções explícitas (ui/, layout.tsx). Se uma exceção nova for legítima, entra na lista **com comentário do porquê** — não se relaxa a regra. |
