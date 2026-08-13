import { describe, it, expect } from "vitest";
import { nomeArquivoUnico, nomeArquivoBoleto } from "@/lib/nfse/nomeArquivo";

describe("nomeArquivoUnico", () => {
  it("sanitiza caracteres inválidos de nome de arquivo", () => {
    const r = nomeArquivoUnico('EMPRESA / A : B * "X"', new Set());
    expect(r).not.toMatch(/[/\\:*?"<>|]/);
    expect(r).toContain("EMPRESA");
  });

  it("desambigua quando a razão social se repete", () => {
    const usados = new Set<string>();
    expect(nomeArquivoUnico("ACME LTDA", usados)).toBe("ACME LTDA");
    expect(nomeArquivoUnico("ACME LTDA", usados)).toBe("ACME LTDA (2)");
    expect(nomeArquivoUnico("ACME LTDA", usados)).toBe("ACME LTDA (3)");
  });

  it("vazio vira placeholder", () => {
    expect(nomeArquivoUnico("   ", new Set())).toBe("SEM RAZAO SOCIAL");
  });
});

describe("nomeArquivoBoleto", () => {
  it("prefixa 'boleto - ' e mantém a razão social", () => {
    expect(nomeArquivoBoleto("ACME LTDA")).toBe("boleto - ACME LTDA");
  });

  it("sanitiza caracteres inválidos de nome de arquivo", () => {
    const r = nomeArquivoBoleto('EMPRESA / A : B * "X"');
    expect(r).not.toMatch(/[/\\:*?"<>|]/);
    expect(r).toMatch(/^boleto - EMPRESA/);
  });

  it("sem razão social retorna vazio (o chamador usa o número)", () => {
    expect(nomeArquivoBoleto("   ")).toBe("");
  });
});
