import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(app)/clientes/actions", () => ({ salvarHonorario: vi.fn() }));

import { HonorarioForm } from "@/components/HonorarioForm";

const ext = {
  dia_vencimento: null,
  qtd_funcionarios: null,
  faixa_faturamento: null,
  data_saida: null,
  indice_reajuste: null,
  percentual_reajuste: null,
  tem_honorarios_recorrentes: false,
};

describe("HonorarioForm — recorrência", () => {
  it("mostra o checkbox e, quando não-recorrente, o aviso de só avulsa", () => {
    const html = renderToStaticMarkup(
      <HonorarioForm clienteId="c1" valorAtual={null} extensao={ext} temContratoAtivo={false} />,
    );
    expect(html).toContain("Cliente tem honorários recorrentes");
    expect(html).toContain("só avulsa");
  });
  it("com contrato ativo + não-recorrente, avisa o conflito", () => {
    const html = renderToStaticMarkup(
      <HonorarioForm clienteId="c1" valorAtual={null} extensao={ext} temContratoAtivo={true} />,
    );
    expect(html).toContain("contrato ativo");
  });
});
