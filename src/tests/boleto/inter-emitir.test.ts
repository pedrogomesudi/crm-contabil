import { describe, it, expect, vi, afterEach } from "vitest";
import { criarAdaptadorInter } from "@/lib/boleto/inter";

function fetchSeq(respostas: { ok?: boolean; status?: number; json: unknown }[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = respostas[i++]!;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as unknown as Response;
  });
}

describe("criarAdaptadorInter.emitir", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("token → cobrancas → consulta e envia x-conta-corrente", async () => {
    const fm = fetchSeq([
      { json: { access_token: "tok", expires_in: 3600 } },
      { json: { codigoSolicitacao: "cod-1" } },
      { json: { boleto: { linhaDigitavel: "123", nossoNumero: "9" }, pix: { pixCopiaECola: "pixcc" } } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "producao");
    const r = await adap.emitir({ valor: 100, vencimento: "2026-08-01", pagadorNome: "ACME", pagadorDocumento: "12345678000199", pagadorEmail: null, descricao: "Honorário", seuNumero: "T-1", pagadorEndereco: { cep: "38400000", logradouro: "Rua X", numero: "10", bairro: "Centro", cidade: "Uberlândia", uf: "MG" } });
    expect(r).toEqual({ provedorBoletoId: "cod-1", nossoNumero: "9", linhaDigitavel: "123", pixCopiaCola: "pixcc", urlPdf: null });
    expect(fm).toHaveBeenCalledTimes(3);
    const initCobranca = (fm.mock.calls[1] as unknown[])[1] as { headers: Record<string, string> };
    expect(initCobranca.headers["x-conta-corrente"]).toBe("99999");
  });
  it("erro no token lança", async () => {
    const fm = fetchSeq([{ ok: false, status: 401, json: { message: "unauthorized" } }]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "sandbox");
    await expect(adap.emitir({ valor: 1, vencimento: "2026-08-01", pagadorNome: "X", pagadorDocumento: "1", pagadorEmail: null, descricao: "d", seuNumero: "n" })).rejects.toThrow(/Inter token 401/);
  });
});
