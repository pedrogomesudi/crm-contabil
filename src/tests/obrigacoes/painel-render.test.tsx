import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/actions", () => ({ listarRiscos: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { PainelRiscosView } from "@/app/(app)/obrigacoes/riscos/PainelRiscosView";
import type { PainelRiscos } from "@/lib/obrigacoes/risco";

const painel: PainelRiscos = {
  resumo: { vencendoHoje: 1, vencidas: 2, semResponsavel: 1 },
  grupos: [
    {
      responsavelId: null,
      responsavelNome: null,
      itens: [
        {
          id: "c",
          clienteNome: "ACME",
          obrigacaoNome: "PGDAS-D",
          competencia: "2026-06-01",
          periodicidade: "mensal",
          vencimentoInterno: "2026-07-20",
          vencimentoLegal: "2026-07-20",
          responsavelId: null,
          responsavelNome: null,
        },
      ],
    },
  ],
};

describe("PainelRiscosView", () => {
  it("mostra os cartões e o grupo sem responsável", () => {
    const html = renderToStaticMarkup(<PainelRiscosView painel={painel} hoje="2026-07-15" />);
    expect(html).toContain("Vencidas");
    expect(html).toContain("Sem responsável");
    expect(html).toContain("ACME");
  });
});
