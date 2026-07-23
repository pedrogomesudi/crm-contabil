import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { GRUPOS_CONFIG, gruposDoPapel } from "@/lib/ui/configuracoes";

// O hub de Configurações tinha 27 cartões numa lista plana, na ordem em que foram criados.
// Agrupar resolve hoje; estes testes existem para não desagrupar sozinho amanhã — tela nova
// sem grupo, ou sem o caminho de volta, quebra aqui em vez de virar item perdido.

const RAIZ = resolve(process.cwd(), "src/app/(app)/configuracoes");

// Toda página sob /configuracoes, como rota. Dinâmicas ([id]) entram na lista com o
// segmento literal — são telas de detalhe, e o teste do "voltar" também vale para elas.
const paginas = (dir: string, prefixo = "/configuracoes"): { rota: string; arquivo: string }[] => {
  const saida: { rota: string; arquivo: string }[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (!statSync(caminho).isDirectory()) continue;
    const rota = `${prefixo}/${nome}`;
    if (readdirSync(caminho).includes("page.tsx")) saida.push({ rota, arquivo: join(caminho, "page.tsx") });
    saida.push(...paginas(caminho, rota));
  }
  return saida;
};

const TODAS = paginas(RAIZ);
const hrefsDoHub = GRUPOS_CONFIG.flatMap((g) => g.itens.map((i) => i.href));

describe("taxonomia do hub", () => {
  it("nenhum href aparece em dois grupos", () => {
    expect(new Set(hrefsDoHub).size).toBe(hrefsDoHub.length);
  });

  it("nenhum id de grupo se repete — o índice do topo usa isso como âncora", () => {
    const ids = GRUPOS_CONFIG.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo grupo tem título, resumo e ao menos um item", () => {
    for (const g of GRUPOS_CONFIG) {
      expect(g.titulo.length, g.id).toBeGreaterThan(0);
      expect(g.resumo.length, g.id).toBeGreaterThan(0);
      expect(g.itens.length, g.id).toBeGreaterThan(0);
    }
  });

  it("toda tela de configuração está em algum grupo (nada de item órfão no hub)", () => {
    const orfas = TODAS.filter((p) => !p.rota.includes("/[")) // detalhe se alcança pela lista pai
      .map((p) => p.rota)
      .filter((r) => !hrefsDoHub.includes(r));
    expect(orfas).toEqual([]);
  });

  it("todo href do hub que aponta para /configuracoes existe de verdade", () => {
    const existentes = TODAS.map((p) => p.rota);
    for (const href of hrefsDoHub.filter((h) => h.startsWith("/configuracoes/"))) {
      expect(existentes, href).toContain(href);
    }
  });
});

describe("filtro por papel", () => {
  it("o assistente vê só a Integração Domínio, e os grupos vazios somem", () => {
    const grupos = gruposDoPapel("assistente");
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.itens.map((i) => i.href)).toEqual(["/integracoes/dominio"]);
  });

  it("o admin vê todos os grupos e todos os itens", () => {
    const grupos = gruposDoPapel("admin");
    expect(grupos).toHaveLength(GRUPOS_CONFIG.length);
    expect(grupos.flatMap((g) => g.itens)).toHaveLength(hrefsDoHub.length);
  });
});

describe("caminho de volta", () => {
  // O menu lateral tem "Configurações", mas voltar por ele custa atravessar a tela inteira
  // e perde o contexto de onde se estava. 17 das 26 telas já traziam o botão; as outras 9
  // obrigavam ao botão do navegador. Consistência aqui é o ponto.
  it("toda tela sob /configuracoes tem botão de volta (menos o próprio hub)", () => {
    const semVoltar = TODAS.filter((p) => !readFileSync(p.arquivo, "utf8").includes("ui/Voltar")).map((p) => p.rota);
    expect(semVoltar).toEqual([]);
  });

  it("as telas de detalhe voltam para a lista pai, não para o hub", () => {
    for (const p of TODAS.filter((x) => x.rota.includes("/["))) {
      const fonte = readFileSync(p.arquivo, "utf8");
      const pai = p.rota.replace(/\/\[[^\]]+\]$/, "");
      expect(fonte, p.rota).toContain(`href="${pai}"`);
    }
  });
});
