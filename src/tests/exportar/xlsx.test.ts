import { describe, it, expect } from "vitest";
import { paraXlsx } from "@/lib/exportar/xlsx";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

const rel: RelatorioExportavel = {
  titulo: "Rentabilidade",
  colunas: [
    { chave: "cliente", rotulo: "Cliente", formato: "texto" },
    { chave: "honorario", rotulo: "Honorário", formato: "moeda" },
    { chave: "inicio", rotulo: "Início", formato: "data" },
  ],
  linhas: [{ cliente: "Acme Ltda", honorario: 1500.5, inicio: "2026-07-10" }],
  totais: { cliente: "Total", honorario: 1500.5 },
};

describe("paraXlsx", () => {
  it("gera um arquivo XLSX de verdade (ZIP começa com PK)", async () => {
    const buf = await paraXlsx(rel);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("não quebra com relatório vazio nem sem totais", async () => {
    const buf = await paraXlsx({ ...rel, linhas: [], totais: undefined });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
