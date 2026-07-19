import { describe, it, expect } from "vitest";
import { validarCampos, type CampoDef } from "@/lib/clientes/campos-custom";

const def = (over: Partial<CampoDef>): CampoDef => ({
  id: "f1",
  nome: "Campo",
  tipo: "texto",
  obrigatorio: false,
  opcoes: [],
  ...over,
});

describe("validarCampos", () => {
  it("normaliza cada tipo", () => {
    const defs = [
      def({ id: "t", tipo: "texto" }),
      def({ id: "n", tipo: "numero" }),
      def({ id: "d", tipo: "data" }),
      def({ id: "b", tipo: "booleano" }),
      def({ id: "l", tipo: "lista", opcoes: ["A", "B"] }),
    ];
    const r = validarCampos(defs, { t: " oi ", n: "12", d: "2026-07-19", b: "on", l: "B" });
    expect(r).toEqual({
      ok: true,
      valores: { t: "oi", n: 12, d: "2026-07-19", b: true, l: "B" },
      faltando: [],
    });
  });

  it("número não-numérico é erro de tipo", () => {
    const r = validarCampos([def({ id: "n", nome: "Faturamento", tipo: "numero" })], { n: "abc" });
    expect(r).toEqual({ erro: 'O campo "Faturamento" deve ser um número.' });
  });

  it("data inválida é erro de tipo", () => {
    const r = validarCampos([def({ id: "d", nome: "Abertura", tipo: "data" })], { d: "2026-13-45" });
    expect(r).toEqual({ erro: 'O campo "Abertura" tem uma data inválida.' });
  });

  it("lista fora das opções é erro de tipo", () => {
    const r = validarCampos([def({ id: "l", nome: "Segmento", tipo: "lista", opcoes: ["A"] })], { l: "Z" });
    expect(r).toEqual({ erro: 'Opção inválida para "Segmento".' });
  });

  it("obrigatório vazio vai para faltando (não bloqueia aqui)", () => {
    const r = validarCampos([def({ id: "t", nome: "RG", obrigatorio: true })], { t: "" });
    expect(r).toEqual({ ok: true, valores: {}, faltando: ["RG"] });
  });

  it("booleano opcional ausente é false e não falta", () => {
    const r = validarCampos([def({ id: "b", nome: "VIP", tipo: "booleano", obrigatorio: true })], { b: "" });
    expect(r).toEqual({ ok: true, valores: { b: false }, faltando: [] });
  });

  it("valor cru sem definição correspondente é ignorado", () => {
    const r = validarCampos([def({ id: "t" })], { t: "x", fantasma: "y" });
    expect(r).toEqual({ ok: true, valores: { t: "x" }, faltando: [] });
  });
});
