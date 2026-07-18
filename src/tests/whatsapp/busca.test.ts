import { describe, it, expect } from "vitest";
import { buscaUnificada, type ClienteParaConversa, type Conversa } from "@/lib/whatsapp/inbox";

const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534988403020",
  cliente: "Moura Purcell",
  contato: null,
  ultima: "oi",
  ultima_em: "2026-07-18T12:00:00Z",
  nao_lidas: 0,
  favorita: false,
  status: "aberta",
  atendenteId: null,
  atendenteNome: null,
  ...over,
});

const cli = (over: Partial<ClienteParaConversa>): ClienteParaConversa => ({
  razaoSocial: "Agroalves Ltda",
  contato: null,
  telefone: "5511999998888",
  ...over,
});

describe("buscaUnificada", () => {
  it("termo vazio → duas listas vazias (a lista usa filtrarConversas)", () => {
    expect(buscaUnificada([conv({})], [cli({})], "  ")).toEqual({ conversas: [], iniciar: [] });
  });

  it("casa conversa pelo nome do cliente, de qualquer aba", () => {
    const finalizada = conv({ status: "finalizada", cliente: "Moura Purcell" });
    const r = buscaUnificada([finalizada], [], "moura");
    expect(r.conversas).toEqual([finalizada]);
    expect(r.iniciar).toEqual([]);
  });

  it("casa cliente SEM conversa em 'iniciar'", () => {
    const r = buscaUnificada([], [cli({ razaoSocial: "Agroalves Ltda" })], "agro");
    expect(r.iniciar.map((c) => c.razaoSocial)).toEqual(["Agroalves Ltda"]);
  });

  it("cliente COM conversa não duplica em 'iniciar' (dedup pelo telefone canônico)", () => {
    const c = conv({ telefone: "5511999998888", cliente: "Agroalves Ltda" });
    const cl2 = cli({ razaoSocial: "Agroalves Ltda", telefone: "5511999998888" });
    const r = buscaUnificada([c], [cl2], "agro");
    expect(r.conversas).toEqual([c]);
    expect(r.iniciar).toEqual([]);
  });

  it("casa conversa por telefone além do nome", () => {
    const r = buscaUnificada([conv({ telefone: "5534988403020", cliente: null })], [], "3498840");
    expect(r.conversas.length).toBe(1);
  });
});
