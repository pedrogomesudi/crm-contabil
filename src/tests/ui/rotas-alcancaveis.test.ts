import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { menuDoPapel } from "@/lib/ui/navegacao";

// Havia 11 rotas fora do menu — Conformidade estava a 3 cliques dentro de "Clientes", e o
// único caminho era um <a> cru no meio de um calendário. Este teste existe para essa dor não
// voltar sozinha: toda rota de TOPO de seção precisa ter caminho até ela.
const RAIZ = resolve(process.cwd(), "src/app/(app)");

const rotas = (dir: string, prefixo = ""): string[] => {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (!statSync(caminho).isDirectory()) continue;
    if (nome.startsWith("[")) continue; // rota dinâmica: é detalhe, não seção
    const rota = `${prefixo}/${nome}`;
    if (readdirSync(caminho).includes("page.tsx")) saida.push(rota);
    saida.push(...rotas(caminho, rota));
  }
  return saida;
};

// Alcançáveis por SubNav — cada uma declarada na tela da sua seção.
const POR_SUBNAV = [
  "/obrigacoes/riscos",
  "/obrigacoes/escalonamento",
  "/obrigacoes/conformidade",
  "/tarefas/recorrencias",
  "/solicitacoes/internas",
  "/onboarding/alertas",
  "/clientes/responsaveis",
  "/nfse/lote",
  "/comercial/propostas",
  "/comercial/metricas",
  "/comercial/precificacao",
  "/comercial/receita",
];
// Financeiro e Configurações mantêm hub (16 telas cada): explodir no menu somaria 32 itens.
const POR_HUB = ["/financeiro", "/configuracoes", "/usuarios", "/lgpd", "/integracoes"];
// Telas que existem por fluxo, não por navegação (abrem de um botão de ação).
const POR_ACAO = ["/clientes/novo", "/clientes/nova-empresa", "/comunicados/novo", "/documentos/retencao"];

describe("nenhuma rota de seção fica órfã", () => {
  const noMenu = menuDoPapel("admin", {
    onboarding: 0,
    riscos: 0,
    escalonamento: 0,
    vencimentos: 0,
    docsVencidos: 0,
  }).flatMap((g) => g.itens.map((i) => i.href));

  it("toda rota é alcançável pelo menu, por SubNav, por hub ou por ação", () => {
    const orfas = rotas(RAIZ).filter((r) => {
      if (noMenu.includes(r)) return false;
      if (POR_SUBNAV.includes(r) || POR_ACAO.includes(r)) return false;
      if (POR_HUB.some((h) => r === h || r.startsWith(`${h}/`))) return false;
      return true;
    });
    expect(orfas).toEqual([]);
  });

  it("as rotas do menu existem de verdade (nada de link morto)", () => {
    const existentes = rotas(RAIZ);
    for (const href of noMenu) {
      if (href === "/") continue;
      expect(existentes).toContain(href);
    }
  });

  it("o SubNav declarado aponta para telas que existem", () => {
    const existentes = rotas(RAIZ);
    for (const r of POR_SUBNAV) expect(existentes).toContain(r);
  });
});
