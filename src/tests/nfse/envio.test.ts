import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { montarCorpoDps, parseResposta } from "@/lib/nfse/envio";

describe("montarCorpoDps", () => {
  it("comprime (gzip) e codifica (base64) o XML", () => {
    const b64 = montarCorpoDps("<DPS>x</DPS>");
    const xml = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
    expect(xml).toBe("<DPS>x</DPS>");
  });
});

describe("parseResposta", () => {
  it("interpreta autorizada", () => {
    const r = parseResposta(200, { chaveAcesso: "3170206abc", nfseXmlGZipB64: null, numero: "12" });
    expect(r.autorizada).toBe(true);
    expect(r.chaveAcesso).toContain("3170206");
    expect(r.numero).toBe("12");
  });
  it("interpreta rejeição com mensagens", () => {
    const r = parseResposta(400, { erros: [{ codigo: "E001", descricao: "IM inválida" }] });
    expect(r.autorizada).toBe(false);
    expect(r.mensagens?.[0]).toContain("IM inválida");
  });
  it("inclui o corpo cru quando não há erros estruturados", () => {
    const r = parseResposta(400, { detalhe: "coisa estranha" });
    expect(r.autorizada).toBe(false);
    expect(r.mensagens?.[0]).toContain("400");
    expect(r.mensagens?.[0]).toContain("coisa estranha");
  });
  it("lê o formato alternativo 'mensagens'", () => {
    const r = parseResposta(400, { mensagens: [{ codigo: "E123", descricao: "cTribNac inválido" }] });
    expect(r.mensagens?.[0]).toContain("cTribNac inválido");
  });
});
