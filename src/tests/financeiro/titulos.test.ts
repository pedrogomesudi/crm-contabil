import { describe, it, expect } from "vitest";
import { saldoTitulo, ehVencido, consolidadoNoGrupo, gruposPresentes, casaGrupoTitulo } from "@/lib/financeiro/titulos";

describe("saldoTitulo", () => {
  it("saldo = valor - baixado, nunca negativo", () => {
    expect(saldoTitulo(500, 0)).toBe(500);
    expect(saldoTitulo(500, 200)).toBe(300);
    expect(saldoTitulo(500, 500)).toBe(0);
    expect(saldoTitulo(500, 600)).toBe(0);
  });
});

describe("ehVencido", () => {
  it("vencido: vencimento no passado e ainda há saldo aberto", () => {
    expect(ehVencido("2000-01-01", "ABERTO", 100)).toBe(true);
  });
  it("não vencido: baixado, cancelado ou sem saldo", () => {
    expect(ehVencido("2000-01-01", "BAIXADO", 0)).toBe(false);
    expect(ehVencido("2000-01-01", "CANCELADO", 100)).toBe(false);
    expect(ehVencido("2999-01-01", "ABERTO", 100)).toBe(false);
  });
});

describe("consolidadoNoGrupo", () => {
  it("mensalidade de cliente em grupo consolida na titular", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "MENSALIDADE" })).toBe(true);
  });
  it("avulsa de cliente em grupo é individual (não consolida)", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "RECEITA_AVULSA" })).toBe(false);
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "DECIMO_TERCEIRO" })).toBe(false);
  });
  it("cliente fora de grupo nunca consolida", () => {
    expect(consolidadoNoGrupo({ grupoCobrancaId: null, origem: "MENSALIDADE" })).toBe(false);
  });
});

describe("gruposPresentes", () => {
  const t = (grupoCobrancaId: string | null, grupoNome: string | null) => ({ grupoCobrancaId, grupoNome });
  it("lista os grupos distintos dos títulos, ordenados por nome", () => {
    expect(gruposPresentes([t("g2", "Zeta"), t("g1", "Alfa"), t("g2", "Zeta"), t(null, null)])).toEqual([
      { id: "g1", nome: "Alfa" },
      { id: "g2", nome: "Zeta" },
    ]);
  });
  it("ordena respeitando acentos do português", () => {
    expect(gruposPresentes([t("g2", "Óptica"), t("g1", "Nutri")]).map((g) => g.nome)).toEqual(["Nutri", "Óptica"]);
  });
  it("sem títulos em grupo, devolve lista vazia", () => {
    expect(gruposPresentes([t(null, null), t(null, null)])).toEqual([]);
  });
  it("grupo sem nome carregado cai no rótulo do id", () => {
    expect(gruposPresentes([t("g1", null)])).toEqual([{ id: "g1", nome: "g1" }]);
  });
});

describe("casaGrupoTitulo", () => {
  const emGrupo = { grupoCobrancaId: "g1" };
  const outroGrupo = { grupoCobrancaId: "g2" };
  const semGrupo = { grupoCobrancaId: null };
  it("TODOS não filtra nada", () => {
    expect(casaGrupoTitulo(emGrupo, "TODOS")).toBe(true);
    expect(casaGrupoTitulo(semGrupo, "TODOS")).toBe(true);
  });
  it("SEM_GRUPO deixa passar só quem não tem grupo", () => {
    expect(casaGrupoTitulo(semGrupo, "SEM_GRUPO")).toBe(true);
    expect(casaGrupoTitulo(emGrupo, "SEM_GRUPO")).toBe(false);
  });
  it("um grupo específico deixa passar só os títulos daquele grupo", () => {
    expect(casaGrupoTitulo(emGrupo, "g1")).toBe(true);
    expect(casaGrupoTitulo(outroGrupo, "g1")).toBe(false);
    expect(casaGrupoTitulo(semGrupo, "g1")).toBe(false);
  });
  it("o filtro é por pertencimento ao grupo, não por boleto consolidado (pega a avulsa também)", () => {
    expect(casaGrupoTitulo({ grupoCobrancaId: "g1" }, "g1")).toBe(true);
    expect(consolidadoNoGrupo({ grupoCobrancaId: "g1", origem: "RECEITA_AVULSA" })).toBe(false);
  });
});
