import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { criarAdaptadorInter, _resetTokenCacheInter } from "@/lib/boleto/inter";

function fetchSeq(respostas: { ok?: boolean; status?: number; json: unknown }[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = respostas[i++]!;
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as unknown as Response;
  });
}
const nadaEsperar = async () => {};

describe("criarAdaptadorInter.emitir", () => {
  beforeEach(() => _resetTokenCacheInter());
  afterEach(() => vi.unstubAllGlobals());
  it("token → cobrancas → consulta e envia x-conta-corrente", async () => {
    const fm = fetchSeq([
      { json: { access_token: "tok", expires_in: 3600 } },
      { json: { codigoSolicitacao: "cod-1" } },
      { json: { boleto: { linhaDigitavel: "123", nossoNumero: "9" }, pix: { pixCopiaECola: "pixcc" } } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "producao");
    const r = await adap.emitir({
      valor: 100,
      vencimento: "2026-08-01",
      pagadorNome: "ACME",
      pagadorDocumento: "12345678000199",
      pagadorEmail: null,
      descricao: "Honorário",
      seuNumero: "T-1",
      pagadorEndereco: {
        cep: "38400000",
        logradouro: "Rua X",
        numero: "10",
        bairro: "Centro",
        cidade: "Uberlândia",
        uf: "MG",
      },
    });
    expect(r).toEqual({
      provedorBoletoId: "cod-1",
      nossoNumero: "9",
      linhaDigitavel: "123",
      pixCopiaCola: "pixcc",
      urlPdf: null,
    });
    expect(fm).toHaveBeenCalledTimes(3);
    const initCobranca = (fm.mock.calls[1] as unknown[])[1] as { headers: Record<string, string> };
    expect(initCobranca.headers["x-conta-corrente"]).toBe("99999");
  });
  it("erro no token lança", async () => {
    const fm = fetchSeq([{ ok: false, status: 401, json: { message: "unauthorized" } }]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid", "sec", "99999", "certpem", "keypem", "sandbox");
    await expect(
      adap.emitir({
        valor: 1,
        vencimento: "2026-08-01",
        pagadorNome: "X",
        pagadorDocumento: "1",
        pagadorEmail: null,
        descricao: "d",
        seuNumero: "n",
      }),
    ).rejects.toThrow(/Inter token 401/);
  });

  it("token 429 re-tenta e depois emite", async () => {
    const fm = fetchSeq([
      { ok: false, status: 429, json: {} }, // 1ª tentativa de token: rate limit
      { json: { access_token: "tok", expires_in: 3600 } }, // 2ª: ok
      { json: { codigoSolicitacao: "cod-9" } },
      { json: { boleto: { linhaDigitavel: "1", nossoNumero: "2" }, pix: { pixCopiaECola: "p" } } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cid429", "sec", "99999", "c", "k", "producao", nadaEsperar);
    const r = await adap.emitir({
      valor: 1,
      vencimento: "2026-08-01",
      pagadorNome: "X",
      pagadorDocumento: "1",
      pagadorEmail: null,
      descricao: "d",
      seuNumero: "n",
    });
    expect(r.provedorBoletoId).toBe("cod-9");
    expect(fm).toHaveBeenCalledTimes(4); // 429 + token ok + cobrancas + consulta
  });

  it("reusa o token cacheado entre emissões (não pede token de novo)", async () => {
    const fm = fetchSeq([
      { json: { access_token: "tok", expires_in: 3600 } }, // token (1x só)
      { json: { codigoSolicitacao: "c1" } },
      { json: { boleto: { linhaDigitavel: "1", nossoNumero: "2" }, pix: { pixCopiaECola: "p" } } },
      { json: { codigoSolicitacao: "c2" } }, // 2ª emissão: já sem token
      { json: { boleto: { linhaDigitavel: "3", nossoNumero: "4" }, pix: { pixCopiaECola: "q" } } },
    ]);
    vi.stubGlobal("fetch", fm);
    const adap = criarAdaptadorInter("cidcache", "sec", "99999", "c", "k", "producao", nadaEsperar);
    const dados = {
      valor: 1,
      vencimento: "2026-08-01",
      pagadorNome: "X",
      pagadorDocumento: "1",
      pagadorEmail: null,
      descricao: "d",
      seuNumero: "n",
    };
    const r1 = await adap.emitir(dados);
    const r2 = await adap.emitir(dados);
    expect(r1.provedorBoletoId).toBe("c1");
    expect(r2.provedorBoletoId).toBe("c2");
    expect(fm).toHaveBeenCalledTimes(5); // 1 token + 2×(cobrancas+consulta)
  });
});
