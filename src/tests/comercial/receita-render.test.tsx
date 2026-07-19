import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/receita/actions", () => ({ carregarReceitaPorOrigem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ReceitaPorOrigem } from "@/app/(app)/comercial/receita/ReceitaPorOrigem";
import type { LinhaReceita } from "@/lib/comercial/receita";

const linhas: LinhaReceita[] = [
  { origem: "Google", valorGanho: 6800, propostaMensal: 800, propostaUnico: 0 },
  { origem: null, valorGanho: 2000, propostaMensal: 0, propostaUnico: 0 },
];

describe("ReceitaPorOrigem", () => {
  it("renderiza a tabela com fontes e total", () => {
    const html = renderToStaticMarkup(<ReceitaPorOrigem linhasIniciais={linhas} hoje="2026-07-18" />);
    expect(html).toContain("Google");
    expect(html).toContain("Sem origem");
    expect(html).toContain("Total");
    expect(html).toContain("Valor ganho");
  });
  it("estado vazio", () => {
    const html = renderToStaticMarkup(<ReceitaPorOrigem linhasIniciais={[]} hoje="2026-07-18" />);
    expect(html).toContain("Nenhum negócio ganho no período");
  });
});
