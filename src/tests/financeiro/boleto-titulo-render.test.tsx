import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/financeiro/contas-a-receber/boleto-actions", () => ({ emitirBoleto: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { BoletoTitulo } from "@/components/financeiro/BoletoTitulo";
import type { BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";

describe("BoletoTitulo", () => {
  it("sem boleto → botão emitir", () => {
    const html = renderToStaticMarkup(<BoletoTitulo tituloId="t1" boleto={null} onMudou={() => {}} />);
    expect(html).toContain("Emitir boleto");
  });
  it("com boleto → linha digitável", () => {
    const b: BoletoView = {
      id: "b1",
      numero: 7,
      provedor: "asaas",
      linhaDigitavel: "34191790010104351004791020150008291070026000",
      pixCopiaCola: "pix",
      urlPdf: null,
      status: "emitido",
    };
    const html = renderToStaticMarkup(<BoletoTitulo tituloId="t1" boleto={b} onMudou={() => {}} />);
    expect(html).toContain("Linha digitável");
    expect(html).toContain("#7");
  });
});
