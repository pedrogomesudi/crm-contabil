import { describe, it, expect } from "vitest";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import { formatarCelula } from "@/lib/exportar/formato";
import { paraCsv, BOM } from "@/lib/exportar/csv";
import { paraHtml } from "@/lib/exportar/html";

// NBSP é o separador que o toLocaleString("pt-BR") usa; normaliza para espaço comum
// para os testes não dependerem do ICU da versão do Node.
const semNbsp = (s: string | undefined) => (s ?? "").replace(/ /g, " ");

describe("formatarCelula", () => {
  it("moeda em pt-BR com dois decimais", () => {
    expect(semNbsp(formatarCelula(1500.5, "moeda"))).toBe("R$ 1.500,50");
  });
  it("data ISO pura vira dd/mm/aaaa sem escorregar de fuso", () => {
    expect(formatarCelula("2026-07-10", "data")).toBe("10/07/2026");
  });
  it("percent recebe o sufixo", () => {
    expect(formatarCelula(12.5, "percent")).toBe("12,5%");
  });
  it("número em pt-BR", () => {
    expect(formatarCelula(1234.5, "numero")).toBe("1.234,5");
  });
  it("texto passa direto", () => {
    expect(formatarCelula("Acme Ltda", "texto")).toBe("Acme Ltda");
  });
  it("null e undefined viram travessão em qualquer formato", () => {
    expect(formatarCelula(null, "moeda")).toBe("—");
    expect(formatarCelula(undefined, "texto")).toBe("—");
    expect(formatarCelula(null, "data")).toBe("—");
  });
  it("zero NÃO é tratado como vazio", () => {
    expect(semNbsp(formatarCelula(0, "moeda"))).toBe("R$ 0,00");
  });
});

const rel: RelatorioExportavel = {
  titulo: "Rentabilidade",
  subtitulo: "Julho/2026",
  colunas: [
    { chave: "cliente", rotulo: "Cliente", formato: "texto" },
    { chave: "honorario", rotulo: "Honorário", formato: "moeda" },
  ],
  linhas: [
    { cliente: "Acme Ltda", honorario: 1500.5 },
    { cliente: "Beta ME", honorario: null },
  ],
  totais: { cliente: "Total", honorario: 1500.5 },
};

describe("paraCsv", () => {
  it("começa com BOM UTF-8 (o Excel abre acentuado)", () => {
    expect(paraCsv(rel).startsWith(BOM)).toBe(true);
  });
  it("usa ponto e vírgula como separador e traz cabeçalho, linhas e totais", () => {
    const linhas = paraCsv(rel).slice(BOM.length).split("\n");
    expect(linhas[0]).toBe("Cliente;Honorário");
    expect(semNbsp(linhas[1])).toBe("Acme Ltda;R$ 1.500,50");
    expect(linhas[2]).toBe("Beta ME;—");
    expect(semNbsp(linhas[3])).toBe("Total;R$ 1.500,50");
  });
  it("sem totais, não emite a linha de totais", () => {
    const sem = paraCsv({ ...rel, totais: undefined });
    expect(sem.slice(BOM.length).split("\n")).toHaveLength(3);
  });
  it("escapa separador, aspas e quebra de linha com aspas duplas", () => {
    const csv = paraCsv({
      titulo: "T",
      colunas: [{ chave: "c", rotulo: "C", formato: "texto" }],
      linhas: [{ c: 'a;b "x"\nc' }],
    });
    expect(csv.slice(BOM.length).split("\n")[1]).toBe('"a;b ""x""');
  });
});

describe("paraHtml", () => {
  it("traz título, subtítulo e a tabela com totais no tfoot", () => {
    const html = paraHtml(rel);
    expect(html).toContain("<h1");
    expect(html).toContain("Rentabilidade");
    expect(html).toContain("Julho/2026");
    expect(html).toContain("<thead");
    expect(html).toContain("<tfoot");
    expect(semNbsp(html)).toContain("R$ 1.500,50");
  });
  it('escapa & < > " — conteúdo do banco não vira marcação', () => {
    const html = paraHtml({
      titulo: '<script>alert("x")</script>',
      colunas: [{ chave: "c", rotulo: "C & D", formato: "texto" }],
      linhas: [{ c: '<img src=x onerror="alert(1)">' }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("C &amp; D");
  });
});
