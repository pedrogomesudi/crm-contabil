import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/precificacao/actions", () => ({
  salvarBaseRegime: vi.fn(),
  definirModoFator: vi.fn(),
  salvarUnidadeFator: vi.fn(),
  criarFaixa: vi.fn(),
  salvarFaixa: vi.fn(),
  removerFaixa: vi.fn(),
  reordenarFaixas: vi.fn(),
  criarComplexidade: vi.fn(),
  salvarComplexidade: vi.fn(),
  removerComplexidade: vi.fn(),
  reordenarComplexidades: vi.fn(),
  criarServico: vi.fn(),
  salvarServico: vi.fn(),
  removerServico: vi.fn(),
  reordenarServicos: vi.fn(),
  salvarGlobais: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormPrecificacao } from "@/app/(app)/configuracoes/precificacao/FormPrecificacao";
import type { PrecificacaoView } from "@/app/(app)/configuracoes/precificacao/actions";

const cfg: PrecificacaoView = {
  regimes: [{ regime: "Simples", valorBase: 500 }],
  fatores: [
    { fator: "faturamento", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
    { fator: "funcionarios", modo: "unidade", valorUnitario: 25, franquia: 5, faixas: [] },
    { fator: "notas", modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  ],
  complexidades: [{ id: "c1", nome: "Média", multiplicador: 1.2, ordem: 1 }],
  servicos: [{ id: "s1", nome: "Folha", valor: 200, recorrencia: "mensal", ativo: true, ordem: 1 }],
  global: { valorMinimo: 400, descontoMaximoPct: 20 },
};

describe("FormPrecificacao", () => {
  it("renderiza os blocos de configuração", () => {
    const html = renderToStaticMarkup(<FormPrecificacao cfg={cfg} />);
    expect(html).toContain("Simples"); // base por regime
    expect(html).toContain("Média"); // complexidade
    expect(html).toContain("Folha"); // serviço
    expect(html).toContain("Valor mínimo"); // globais
    expect(html).toContain("Faturamento"); // rótulo do fator
    expect(html).toContain("Faixas"); // opção de modo do fator
  });
});
