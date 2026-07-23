import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({
  salvarObrigacao: vi.fn(),
  excluirObrigacao: vi.fn(),
  semearMatrizPadrao: vi.fn(),
  marcarRevisada: vi.fn(),
  aplicarDoPadrao: vi.fn(),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorMatriz } from "@/app/(app)/configuracoes/obrigacoes/EditorMatriz";
import type { ObrigacaoRow } from "@/app/(app)/configuracoes/obrigacoes/actions";

const linhas: ObrigacaoRow[] = [
  {
    id: "1",
    codigo: "PGDAS-D",
    nome: "PGDAS-D",
    esfera: "federal",
    periodicidade: "mensal",
    aplicavelA: ["simples_sem_func"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 20,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    comprovanteObrigatorio: true,
    ativa: true,
    ordem: 20,
    baseLegal: "Resolução CGSN nº 140/2018",
    fonteUrl: "",
    observacaoCuradoria: "",
    revisadaEm: null,
    revisadaPorNome: null,
    estadoRevisao: "nunca",
  },
];

describe("EditorMatriz", () => {
  it("lista obrigações e o botão de semear", () => {
    const html = renderToStaticMarkup(<EditorMatriz linhas={linhas} />);
    expect(html).toContain("PGDAS-D");
    expect(html).toContain("Semear matriz padrão");
  });

  // A matriz é de onde sai o calendário: quem edita o prazo precisa ver, ali, se a regra
  // já foi conferida por gente.
  it("mostra o selo de revisão de cada obrigação", () => {
    const html = renderToStaticMarkup(<EditorMatriz linhas={linhas} />);
    expect(html).toContain("nunca revisada");
    expect(html).toContain("Marcar revisada");
  });

  it("obrigação revisada recentemente aparece como revisada, com quem conferiu", () => {
    const html = renderToStaticMarkup(
      <EditorMatriz
        linhas={[
          { ...linhas[0]!, estadoRevisao: "em_dia", revisadaEm: "2026-07-01", revisadaPorNome: "Ana Contadora" },
        ]}
      />,
    );
    expect(html).toContain("revisada");
    expect(html).toContain("Ana Contadora");
    expect(html).toContain("01/07/2026");
  });
});
