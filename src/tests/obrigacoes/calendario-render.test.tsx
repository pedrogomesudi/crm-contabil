import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/obrigacoes/actions", () => ({ listarInstancias: vi.fn(), gerarCompetencia: vi.fn() }));
vi.mock("@/app/(app)/obrigacoes/baixa-actions", () => ({ darBaixa: vi.fn(), reabrir: vi.fn(), alternarDispensa: vi.fn(), urlComprovante: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { Calendario } from "@/app/(app)/obrigacoes/Calendario";
import type { InstanciaView } from "@/app/(app)/obrigacoes/actions";

const inst: InstanciaView[] = [{ id: "1", clienteNome: "ACME LTDA", obrigacaoNome: "PGDAS-D", obrigacaoCodigo: "PGDAS-D", periodicidade: "mensal", competencia: "2026-07-01", vencimentoLegal: "2026-08-20", vencimentoInterno: "2026-08-20", status: "pendente", responsavelNome: "Maria", meu: true, entregueEm: null, entreguePorNome: null, temComprovante: false, comprovanteObrigatorio: true }];

describe("Calendario", () => {
  it("renderiza filtros, instância e o botão de gerar", () => {
    const html = renderToStaticMarkup(<Calendario ano={2026} mes={8} instancias={inst} podeGerar={true} />);
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("PGDAS-D");
    expect(html).toContain("Gerar competência");
  });
});
