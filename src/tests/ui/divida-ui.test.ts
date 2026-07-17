import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";

// As três dívidas que a Fatia 3 pagou. Cada uma nasceu do mesmo jeito: uma exceção pontual que
// ninguém viu virar padrão. O amber chegou a 9 shades para 3 papéis; o <main> se duplicou em 61
// telas; o "voltar" virou 2 estilos. Nenhuma foi decidida — todas foram acumuladas.
// Este teste é o que impede a terceira vez. Ele não é sobre estilo: é o registro de uma decisão.
//
// Exceção nova entra na lista COM o motivo escrito. A regra não se relaxa — foi relaxar que
// produziu a dívida.

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

const rel = (p: string) => relative(process.cwd(), p);

// O escopo é o app e seus componentes. O portal ((portal)/**) é layout separado, com régua e
// <main> próprios — não herda estas regras. Os testes não se auditam.
const ESCOPO = [...arquivos(resolve(RAIZ, "app/(app)")), ...arquivos(resolve(RAIZ, "components"))];

// Comentário não é código. Sem isso o teste acusa três arquivos que apenas EXPLICAM, em prosa,
// por que não têm <main> — e foi essa confusão entre prosa e elemento que fez o plano desta
// fatia contar 62 telas onde havia 61.
// O `(?<!:)` protege o "//" de https:// dentro de string.
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

const fonte = (p: string) => semComentarios(readFileSync(p, "utf8"));

describe("o amber não volta", () => {
  // 53 classes, 9 shades, 24 arquivos — para 3 papéis, todos cobertos por 4 tokens de marca:
  // atencao, atencao-fundo, atencao-borda, atencao-solido.
  //
  // Qualquer `amber-<n>`, sem lista de prefixos. A primeira versão listava bg|text|border|... e
  // deixava passar divide-, outline-, accent-, decoration-, shadow-, caret-, placeholder-. Uma
  // allowlist de prefixos só cobre os usos que já existiam — e a dívida entra pelo uso novo.
  it("nenhuma classe amber do Tailwind em (app)/** ou components/**", () => {
    const infratores = ESCOPO.filter((p) => /\bamber-\d/.test(fonte(p)));
    expect(infratores.map(rel)).toEqual([]);
  });
});

describe("o <main> não se duplica", () => {
  // O layout do (app) já tem <main id="conteudo">. Um segundo <main> dentro dele faz o leitor
  // de tela anunciar "principal" duas vezes (WCAG 1.3.1). A régua é o <Container>.
  const PODE_TER_MAIN: Record<string, string> = {
    "src/app/(app)/layout.tsx": "é O <main> da aplicação — o único legítimo aqui",
    "src/components/auth/AuthCard.tsx": "só é usado em /login/**, fora do layout do (app): não aninha",
  };

  it("nenhum <main> em (app)/** ou components/**, exceto os declarados", () => {
    const infratores = ESCOPO.filter((p) => /<main[\s>]/.test(fonte(p)))
      .map(rel)
      .filter((p) => !(p in PODE_TER_MAIN));
    expect(infratores).toEqual([]);
  });

  it("as exceções declaradas continuam existindo (a lista não vira ficção)", () => {
    for (const p of Object.keys(PODE_TER_MAIN)) {
      expect(fonte(resolve(process.cwd(), p))).toMatch(/<main[\s>]/);
    }
  });
});

describe("a régua é o Container, não o max-w solto", () => {
  const foraDoUi = () => ESCOPO.filter((p) => !rel(p).startsWith("src/components/ui/"));

  // Um max-w genérico NÃO é régua e não entra aqui: max-w-2xl na folha impressa, max-w-[85%] no
  // balão de conversa, max-w-full num <audio>. Proibir todo max-w viraria ruído, e teste ruidoso
  // é teste desligado. As duas regras abaixo pegam régua pela forma, não pelo prefixo.
  it("as larguras fixas do Container (720/1280) só existem dentro de components/ui/", () => {
    const infratores = foraDoUi().filter((p) => /max-w-\[(720|1280)px\]/.test(fonte(p)));
    expect(infratores.map(rel)).toEqual([]);
  });

  // A terceira régua é `larga` (max-w-full), e o max-w-full genérico é comum demais para ser
  // proibido — o que a denuncia é o par com mx-auto: centrar E limitar é o trabalho do Container.
  // Um <audio className="max-w-full"> não centra nada. Sem isto, a única régua que voltava calada
  // era justo a das 5 telas migradas para largura="larga".
  it("nenhum `mx-auto` + `max-w-full` solto fora de components/ui/", () => {
    const infratores = foraDoUi().filter((p) =>
      /class(Name)?="[^"]*\b(mx-auto\b[^"]*\bmax-w-full|max-w-full\b[^"]*\bmx-auto)\b[^"]*"/.test(fonte(p)),
    );
    expect(infratores.map(rel)).toEqual([]);
  });
});

describe("só existe um jeito de voltar", () => {
  // O <Voltar> é o padrão. Estas quatro setas NÃO são "voltar" — são direção, e trocá-las por
  // navegação teria sido um bug. Ficam, nomeadas.
  const SETA_NAO_E_VOLTAR: Record<string, string> = {
    "src/app/(app)/comercial/QuadroComercial.tsx": "move o card para a etapa anterior do funil",
    "src/app/(app)/tarefas/PainelTarefas.tsx": "move a tarefa para o status anterior do kanban",
    "src/app/(app)/comercial/MetricasFunil.tsx": "pagina o período (faz par com o → seguinte)",
    "src/app/(app)/tarefas/Calendario.tsx": "mês anterior (faz par com o 'seguinte →')",
  };

  // A entidade HTML conta: &larr; desenha o mesmo pixel e é a mesma dívida.
  const SETA = /←|&larr;/;

  it("nenhum ← em (app)/** ou components/**, exceto as setas de direção declaradas", () => {
    const infratores = ESCOPO.filter((p) => SETA.test(fonte(p)))
      .map(rel)
      .filter((p) => !(p in SETA_NAO_E_VOLTAR));
    expect(infratores).toEqual([]);
  });

  it("as setas de direção declaradas continuam existindo (a lista não vira ficção)", () => {
    for (const p of Object.keys(SETA_NAO_E_VOLTAR)) {
      expect(fonte(resolve(process.cwd(), p))).toMatch(SETA);
    }
  });
});

// Extrai o corpo de cada tag <input|select|textarea ...>, respeitando chaves {}. Uma regex
// não serve aqui: `[^<>]*` para no `>` de um arrow handler (`onChange={(e) => …}`), e como quase
// todo controle controlado põe o handler ANTES do className, 99 controles com a classe à mão
// escaparam calados do guard — a própria dívida que ele existe para barrar. A primeira revisão
// do branch pegou isso; o parser abaixo conta chaves e só para no `>` de profundidade zero.
export function corposDeControle(src: string): string[] {
  const corpos: string[] = [];
  const re = /<(input|select|textarea)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let profundidade = 0;
    let buf = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === "{") profundidade++;
      else if (ch === "}") profundidade--;
      else if (ch === ">" && profundidade === 0) break;
      buf += ch;
      i++;
    }
    corpos.push(buf);
  }
  return corpos;
}

// Uma classe de borda "estática" — a borda em repouso, não uma variante focus:/hover:. Um
// controle que só tem `focus:border-verde` (realce de foco) não desenha caixa própria e não é
// dívida; um que tem `border`/`border-linha` cru, sim. É o que separa infrator de inocente.
const bordaEstatica = (classes: string) => classes.split(/\s+/).some((c) => /^border(-|$)/.test(c) && !c.includes(":"));

describe("o controle não escreve a própria borda", () => {
  // A quinta dívida: ~260 controles com a classe escrita à mão, em famílias — px-3 py-2 e
  // px-2 py-1.5 (dois degraus reais), rounded de 4px, border sem cor, padding em atalho, e a
  // mesma string extraída para uma const local. Todas nasceram do mesmo jeito: o token respondia
  // "como se parece" E "quanto ocupa", então quem precisava de outra largura copiava e alterava.
  // O `controleCls(tamanho)` separou as duas perguntas; este guard impede a cópia de voltar.

  // Controles que NÃO usam o token, com o motivo — não é relaxar a regra, é nomear a exceção.
  const NAO_E_CONTROLE_DE_FORMULARIO: Record<string, string> = {
    // Célula de planilha: 12 colunas de mês numa linha, dentro de <td> de 2px. O degrau
    // compacto (px-2 py-1.5 text-sm) alargaria a grade inteira. Ver o comentário no arquivo.
    "src/app/(app)/financeiro/orcamento/GradeOrcamento.tsx": "célula de planilha, não campo (celulaCls)",
    // Campo de busca: pill maior (rounded-xl, py-2.5) com pl-9 para o ícone da lupa. É um quarto
    // tamanho deliberado, e é o MESMO campo do Toolbar (esse vive em components/ui/, já fora do
    // escopo). Unificar os dois exige o <Input>, que ainda não é usado — dívida da fatia 5.
    "src/app/(app)/clientes/page.tsx": "campo de busca (rounded-xl, ícone) — dívida da fatia 5",
    // Campo de composição de mensagem do chat: pill grande (rounded-xl, bg-creme, px-4 py-2.5),
    // como os de busca. Não é campo de formulário — é caixa de "Responder…".
    "src/app/(app)/atendimento/Inbox.tsx": "campo de mensagem do chat (rounded-xl, bg-creme)",
    // Input de percentual da tabela de reajuste em lote: borda CONDICIONAL (border-negativo quando
    // o valor é negativo, border-linha caso contrário) — feedback de erro que o token, de borda
    // fixa, não expressa. E é w-20 px-1 py-0.5, menor que o compacto, como a célula de planilha.
    "src/app/(app)/financeiro/reajuste/ReajusteLote.tsx": "input de % com borda condicional (feedback de erro)",
  };

  // Uma const parece classe de CONTROLE (não de card): tem borda estática e o canto de controle
  // (rounded-lg/rounded), não rounded-2xl/3xl. Sem isto, um `const card = "rounded-2xl border …"`
  // (painel, não campo) seria falso positivo.
  const constDeControle = (cls: string) =>
    bordaEstatica(cls) && /\brounded(-lg)?\b/.test(cls) && !/\brounded-[23]xl\b/.test(cls);

  // O className do controle pode estar em aspas ("…") OU em template-literal (`…${cond}…`). A
  // segunda revisão do branch achou um <input> com `rounded border … ${neg ? "border-negativo" :
  // "border-linha"}` que passava calado — o guard antigo só via aspas duplas. Pegamos os dois:
  // uma classe de borda "estática" (fora de ${…}) em qualquer das duas formas denuncia a caixa
  // desenhada à mão. O trecho ${…} interpolado é removido antes de testar — border-negativo lá
  // dentro é escolha de cor condicional, não a borda-base copiada.
  const classNameDoControle = (corpo: string): string | null => {
    const aspas = /className="([^"]*)"/.exec(corpo);
    if (aspas?.[1] !== undefined) return aspas[1];
    const tmpl = /className=\{`([^`]*)`\}/.exec(corpo);
    if (tmpl?.[1] !== undefined) return tmpl[1].replace(/\$\{[^}]*\}/g, " ");
    return null;
  };

  const declaraBorda = (p: string): boolean => {
    const src = fonte(p);
    const inline = corposDeControle(src).some((corpo) => {
      const cm = classNameDoControle(corpo);
      return cm ? bordaEstatica(cm) : false;
    });
    const emConst = [...src.matchAll(/\bconst \w+\s*=\s*\n?\s*"([^"]*)"/g)].some((m) =>
      m[1] ? constDeControle(m[1]) : false,
    );
    return inline || emConst;
  };

  it("nenhum <input|select|textarea> declara `border` estática — nem inline, nem em const", () => {
    const infratores = ESCOPO.filter((p) => !rel(p).startsWith("src/components/ui/"))
      .filter(declaraBorda)
      .map(rel)
      .filter((p) => !(p in NAO_E_CONTROLE_DE_FORMULARIO));
    expect(infratores).toEqual([]);
  });

  it("as exceções declaradas continuam existindo (a lista não vira ficção)", () => {
    for (const p of Object.keys(NAO_E_CONTROLE_DE_FORMULARIO)) {
      expect(declaraBorda(resolve(process.cwd(), p))).toBe(true);
    }
  });
});
