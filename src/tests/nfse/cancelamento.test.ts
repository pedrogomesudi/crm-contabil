import { describe, it, expect } from "vitest";
import { montarEventoCancelamento, parseRespostaEvento } from "@/lib/nfse/cancelamento";
import type { DadosCancelamento } from "@/lib/nfse/tipos";

const d: DadosCancelamento = {
  chave: "31702062253627128000146000000000026726078221079739",
  nDFSe: "264",
  cnpj: "53627128000146",
  ambiente: "homologacao",
  cMotivo: "1",
  xMotivo: "Emitida com valor incorreto",
};

describe("montarEventoCancelamento", () => {
  it("monta o evento com Id, chNFSe, cMotivo, xMotivo e tpAmb de homologação", () => {
    const { xml, idEvento } = montarEventoCancelamento(d);
    expect(idEvento).toMatch(/^PRE/);
    expect(xml).toContain(`Id="${idEvento}"`);
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain(`<chNFSe>${d.chave}</chNFSe>`);
    expect(xml).toContain("<cMotivo>1</cMotivo>");
    expect(xml).toContain("<xMotivo>Emitida com valor incorreto</xMotivo>");
  });
});

describe("parseRespostaEvento", () => {
  it("interpreta aceito (cStat de sucesso)", () => {
    const r = parseRespostaEvento(200, {
      retEvento: { cStat: "135", xMotivo: "Evento registrado", idEvento: "ID1" },
    });
    expect(r.aceito).toBe(true);
    expect(r.idEvento).toBe("ID1");
  });
  it("interpreta rejeição", () => {
    const r = parseRespostaEvento(400, { erros: [{ codigo: "E0840", descricao: "Fora do prazo" }] });
    expect(r.aceito).toBe(false);
    expect(r.mensagens?.[0]).toContain("Fora do prazo");
  });
  it("inclui o corpo cru quando não há erro estruturado", () => {
    const r = parseRespostaEvento(400, { detalhe: "coisa estranha" });
    expect(r.aceito).toBe(false);
    expect(r.mensagens?.[0]).toContain("400");
    expect(r.mensagens?.[0]).toContain("coisa estranha");
  });
});
