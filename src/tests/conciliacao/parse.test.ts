import { describe, it, expect } from "vitest";
import { parsearOFX, cabecalhosCSV, parsearCSV, dedupHash } from "@/lib/conciliacao/parse";

const OFX_V2 = `<OFX><BANKMSGSRSV1><STMTTRNRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260701120000[-03:EST]</DTPOSTED><TRNAMT>1500.00</TRNAMT><FITID>ABC1</FITID><MEMO>PIX RECEBIDO ACME</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260702</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>ABC2</FITID><NAME>TARIFA</NAME></STMTTRN>
</BANKTRANLIST></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_V1 = `OFXHEADER:100
<OFX><STMTTRN><DTPOSTED>20260703
<TRNAMT>200.50
<FITID>X9
<MEMO>DEPOSITO
</STMTTRN></OFX>`;

describe("parsearOFX", () => {
  it("lê v2 (XML) com sinal, fitid, memo/name", () => {
    const r = parsearOFX(OFX_V2);
    expect(r).toEqual([
      { data: "2026-07-01", valor: 1500, descricao: "PIX RECEBIDO ACME", fitid: "ABC1" },
      { data: "2026-07-02", valor: -89.9, descricao: "TARIFA", fitid: "ABC2" },
    ]);
  });
  it("lê v1 (SGML, tags sem fechamento)", () => {
    const r = parsearOFX(OFX_V1);
    expect(r).toEqual([{ data: "2026-07-03", valor: 200.5, descricao: "DEPOSITO", fitid: "X9" }]);
  });
});

const CSV = `Data;Histórico;Valor
01/07/2026;PIX RECEBIDO;1.500,00
02/07/2026;TARIFA;-89,90
03/07/2026;COMPRA;(50,00)`;

describe("cabecalhosCSV / parsearCSV", () => {
  it("detecta delimitador e cabeçalhos", () => {
    expect(cabecalhosCSV(CSV)).toEqual(["Data", "Histórico", "Valor"]);
  });
  it("parseia data BR e valor com vírgula/negativo/parênteses", () => {
    const r = parsearCSV(CSV, { data: "Data", valor: "Valor", descricao: "Histórico" });
    expect(r).toEqual([
      { data: "2026-07-01", valor: 1500, descricao: "PIX RECEBIDO", fitid: null },
      { data: "2026-07-02", valor: -89.9, descricao: "TARIFA", fitid: null },
      { data: "2026-07-03", valor: -50, descricao: "COMPRA", fitid: null },
    ]);
  });
});

describe("dedupHash", () => {
  it("usa fitid quando existe", () => {
    expect(dedupHash({ data: "2026-07-01", valor: 10, descricao: "x", fitid: "F1" })).toBe("F1");
  });
  it("sem fitid: estável e sensível a data/valor/descrição", () => {
    const a = dedupHash({ data: "2026-07-01", valor: 10, descricao: "PIX ACME", fitid: null });
    const b = dedupHash({ data: "2026-07-01", valor: 10, descricao: "pix acme", fitid: null });
    const c = dedupHash({ data: "2026-07-01", valor: 11, descricao: "PIX ACME", fitid: null });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
