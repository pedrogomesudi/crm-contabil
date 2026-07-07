import { describe, it, expect } from "vitest";
import { linhasPagamento, competenciaBR, preSelecionadas, montarMensagemNota, vencimentoBR } from "@/lib/whatsapp/notas-envio";

describe("linhasPagamento", () => {
  it("PIX + TED completo", () => {
    expect(
      linhasPagamento({ pixChave: "12.345.678/0001-90", banco: "Inter", agencia: "0001", conta: "12345-6", titular: "Gomes", documento: "12.345.678/0001-90" }),
    ).toBe("PIX: 12.345.678/0001-90\nTED: Banco Inter, Ag. 0001, Conta 12345-6 — Gomes (12.345.678/0001-90)");
  });
  it("só PIX", () => {
    expect(linhasPagamento({ pixChave: "chave@pix.com" })).toBe("PIX: chave@pix.com");
  });
  it("só TED", () => {
    expect(linhasPagamento({ banco: "Inter", agencia: "1", conta: "9" })).toBe("TED: Banco Inter, Ag. 1, Conta 9");
  });
  it("vazio → string vazia", () => {
    expect(linhasPagamento({})).toBe("");
  });
});

describe("competenciaBR", () => {
  it("YYYY-MM-DD → MM/YYYY", () => {
    expect(competenciaBR("2026-07-01")).toBe("07/2026");
  });
  it("valor inesperado → devolve como veio", () => {
    expect(competenciaBR("abc")).toBe("abc");
  });
});

describe("preSelecionadas", () => {
  it("marca só as pendentes (jaEnviada false)", () => {
    const s = preSelecionadas([
      { nfseId: "a", jaEnviada: false },
      { nfseId: "b", jaEnviada: true },
      { nfseId: "c", jaEnviada: false },
    ]);
    expect([...s].sort()).toEqual(["a", "c"]);
  });
  it("todas enviadas → vazio", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: true }]).size).toBe(0);
  });
  it("nenhuma enviada → todas", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: false }, { nfseId: "b", jaEnviada: false }]).size).toBe(2);
  });
});

describe("montarMensagemNota", () => {
  const vars = {
    nome: "Breno", empresa: "DGX LTDA", competencia: "07/2026", valor: "R$ 300,00", vencimento: "10/07/2026",
    pix: "530@pix", favorecido: "ELEVARE", cnpj: "53.627/0001-46", banco: "0260", agencia: "0001", conta: "552-4",
    pagamento: "PIX: 530@pix",
  };
  it("ignora maiúscula/acento/espaço/pontuação nos marcadores", () => {
    const t = "Olá {NOME}! Ref {COMPETÊNCIA}, R$ {VALOR}, venc {DATA}. PIX: {CHAVE PIX} Fav: {RAZÃO SOCIAL} CNPJ: {CNPJ} {BANCO} {AG} {C/C}";
    expect(montarMensagemNota(t, vars)).toBe(
      "Olá Breno! Ref 07/2026, R$ R$ 300,00, venc 10/07/2026. PIX: 530@pix Fav: ELEVARE CNPJ: 53.627/0001-46 0260 0001 552-4",
    );
  });
  it("aceita nomes minúsculos e {pagamento}", () => {
    expect(montarMensagemNota("{empresa} — {pagamento}", vars)).toBe("DGX LTDA — PIX: 530@pix");
  });
  it("marcador desconhecido → vazio", () => {
    expect(montarMensagemNota("a{FOOBAR}b", vars)).toBe("ab");
  });
});

describe("vencimentoBR", () => {
  it("dia do cadastro + mês da competência → DD/MM/YYYY", () => {
    expect(vencimentoBR("2026-07-01", 15)).toBe("15/07/2026");
  });
  it("dia com 1 dígito → zero-pad", () => {
    expect(vencimentoBR("2026-07-01", 5)).toBe("05/07/2026");
  });
  it("sem dia (null) → vazio", () => {
    expect(vencimentoBR("2026-07-01", null)).toBe("");
  });
});
