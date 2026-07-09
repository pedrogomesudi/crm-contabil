import { describe, it, expect, vi, afterEach } from "vitest";
import { criarAdaptadorAsaas } from "@/lib/boleto/asaas";

function fetchSeq(respostas: { ok?: boolean; status?: number; json: unknown }[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = respostas[i++]!;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as unknown as Response;
  });
}

describe("criarAdaptadorAsaas.emitir", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("encadeia customer → payment → identif → pix", async () => {
    const fm = fetchSeq([
      { json: { id: "cus_1" } },
      { json: { id: "pay_1", bankSlipUrl: "http://slip" } },
      { json: { identificationField: "12345", nossoNumero: "999" } },
      { json: { payload: "pixcopia" } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorAsaas("key", "sandbox");
    const r = await adap.emitir({ valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "123", pagadorEmail: null, descricao: "Honorário", seuNumero: "T-1" });
    expect(r).toEqual({ provedorBoletoId: "pay_1", nossoNumero: "999", linhaDigitavel: "12345", pixCopiaCola: "pixcopia", urlPdf: "http://slip" });
    expect(fm).toHaveBeenCalledTimes(4);
    expect((fm.mock.calls[0] as unknown[])[0]).toBe("https://api-sandbox.asaas.com/v3/customers");
  });
  it("erro no /payments lança", async () => {
    const fm = fetchSeq([
      { json: { id: "cus_1" } },
      { ok: false, status: 400, json: { errors: [{ description: "inválido" }] } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorAsaas("key", "producao");
    await expect(adap.emitir({ valor: 1, vencimento: "2026-08-01", pagadorNome: "X", pagadorDocumento: "1", pagadorEmail: null, descricao: "d", seuNumero: "n" })).rejects.toThrow(/Asaas 400/);
  });
});
