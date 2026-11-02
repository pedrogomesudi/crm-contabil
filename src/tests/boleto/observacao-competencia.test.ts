import { describe, it, expect } from "vitest";
import { linhasObservacaoBoleto } from "@/lib/boleto/emissao";

describe("linhasObservacaoBoleto", () => {
  it("nome e competência numa linha, no formato MM/AAAA", () => {
    expect(linhasObservacaoBoleto("GOMES ADVOCACIA", "2026-10-01")).toEqual(["GOMES ADVOCACIA — competência 10/2026"]);
  });

  it("quebra em duas linhas quando a razão social não cabe", () => {
    const longa = "A".repeat(70);
    expect(linhasObservacaoBoleto(longa, "2026-10-01")).toEqual([longa, "Competência 10/2026"]);
  });

  it("não quebra no limite exato de 78 caracteres", () => {
    // " — competência 10/2026" ocupa 22 chars: sobram 56 para o nome.
    const nome = "B".repeat(56);
    const r = linhasObservacaoBoleto(nome, "2026-10-01");
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(78);
  });

  it("aceita a competência já como YYYY-MM", () => {
    expect(linhasObservacaoBoleto("ACME", "2026-01")).toEqual(["ACME — competência 01/2026"]);
  });

  it("sem competência, devolve só o nome", () => {
    expect(linhasObservacaoBoleto("ACME", null)).toEqual(["ACME"]);
  });

  it("sem nome e sem competência, não gera linha vazia", () => {
    expect(linhasObservacaoBoleto("", null)).toEqual([]);
  });
});
