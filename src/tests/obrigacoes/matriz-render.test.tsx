import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ salvarObrigacao: vi.fn(), excluirObrigacao: vi.fn(), semearMatrizPadrao: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { EditorMatriz } from "@/app/(app)/configuracoes/obrigacoes/EditorMatriz";
import type { ObrigacaoRow } from "@/app/(app)/configuracoes/obrigacoes/actions";

const linhas: ObrigacaoRow[] = [{ id: "1", codigo: "PGDAS-D", nome: "PGDAS-D", esfera: "federal", periodicidade: "mensal", aplicavelA: ["simples_sem_func"], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, comprovanteObrigatorio: true, ativa: true, ordem: 20 }];

describe("EditorMatriz", () => {
  it("lista obrigações e o botão de semear", () => {
    const html = renderToStaticMarkup(<EditorMatriz linhas={linhas} />);
    expect(html).toContain("PGDAS-D");
    expect(html).toContain("Semear matriz padrão");
  });
});
