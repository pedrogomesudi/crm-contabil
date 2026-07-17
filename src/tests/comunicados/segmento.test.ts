import { describe, it, expect } from "vitest";
import { aplicarFiltro, descreverFiltro, elegiveis, type ClienteAlvo } from "@/lib/comunicados/segmento";

const cli = (over: Partial<ClienteAlvo>): ClienteAlvo => ({
  id: "1",
  razaoSocial: "Cliente",
  email: "c@x.com",
  telefone: "62999998888",
  telefoneDdi: "55",
  cpfCnpj: "1",
  regime: "Simples",
  tipo: "PJ",
  status: "ativo",
  cidade: "Goiânia",
  uf: "GO",
  contadorId: null,
  aceitaComunicados: true,
  ...over,
});

describe("aplicarFiltro", () => {
  it("OU dentro do critério: Simples ou MEI", () => {
    const base = [
      cli({ id: "a", regime: "Simples" }),
      cli({ id: "b", regime: "MEI" }),
      cli({ id: "c", regime: "Real" }),
    ];
    expect(aplicarFiltro(base, { regimes: ["Simples", "MEI"] }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("E entre critérios: Simples E de Goiânia", () => {
    const base = [
      cli({ id: "a", regime: "Simples", cidade: "Goiânia" }),
      cli({ id: "b", regime: "Simples", cidade: "Anápolis" }),
    ];
    expect(aplicarFiltro(base, { regimes: ["Simples"], cidade: "Goiânia" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("cidade compara sem acento e sem caixa (o cadastro é digitado à mão)", () => {
    expect(aplicarFiltro([cli({ id: "a", cidade: "GOIANIA" })], { cidade: "Goiânia" })).toHaveLength(1);
  });

  it("cliente sem endereço não quebra o filtro de cidade — só não entra", () => {
    expect(aplicarFiltro([cli({ id: "a", cidade: null, uf: null })], { cidade: "Goiânia" })).toHaveLength(0);
  });

  it("filtro vazio devolve todos", () => {
    expect(aplicarFiltro([cli({ id: "a" }), cli({ id: "b" })], {})).toHaveLength(2);
  });

  it("filtra por status e por contador", () => {
    const base = [
      cli({ id: "a", status: "ativo", contadorId: "u1" }),
      cli({ id: "b", status: "inativo", contadorId: "u1" }),
      cli({ id: "c", status: "ativo", contadorId: "u2" }),
    ];
    expect(aplicarFiltro(base, { status: ["ativo"], contadorId: "u1" }).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("elegiveis", () => {
  it("exclui quem não tem e-mail e quem optou por não receber, com o motivo", () => {
    const base = [cli({ id: "a" }), cli({ id: "b", email: null }), cli({ id: "c", aceitaComunicados: false })];
    const r = elegiveis(base, "email");
    expect(r.destinatarios.map((c) => c.id)).toEqual(["a"]);
    expect(r.excluidos.map((e) => [e.cliente.id, e.motivo])).toEqual([
      ["b", "Sem e-mail cadastrado"],
      ["c", "Não aceita comunicados"],
    ]);
  });

  it("no WhatsApp, exclui quem não tem telefone", () => {
    const r = elegiveis([cli({ id: "a", telefone: null })], "whatsapp");
    expect(r.destinatarios).toHaveLength(0);
    expect(r.excluidos[0]?.motivo).toBe("Sem telefone cadastrado");
  });

  it("e-mail inválido no cadastro conta como sem e-mail (não vira erro de envio)", () => {
    const r = elegiveis([cli({ id: "a", email: "nao-eh-email" })], "email");
    expect(r.destinatarios).toHaveLength(0);
    expect(r.excluidos[0]?.motivo).toBe("Sem e-mail cadastrado");
  });
});

describe("descreverFiltro", () => {
  it("descreve o segmento em português — é o que o operador lê antes de disparar", () => {
    expect(descreverFiltro({ regimes: ["Simples", "MEI"], cidade: "Goiânia", uf: "GO" })).toBe(
      "Simples ou MEI · Goiânia/GO",
    );
    expect(descreverFiltro({})).toBe("Toda a base");
  });
});
