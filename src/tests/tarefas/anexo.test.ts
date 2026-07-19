import { describe, it, expect } from "vitest";
import { caminhoAnexoTarefa, nomeSeguro } from "@/lib/tarefas/anexo";

describe("nomeSeguro", () => {
  it("troca espaços e tira acentos, preserva a extensão", () => {
    expect(nomeSeguro("Relatório Anual 2026.pdf")).toBe("Relatorio_Anual_2026.pdf");
  });
  it("neutraliza path traversal", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("etc_passwd");
  });
  it("vazio vira 'arquivo'", () => {
    expect(nomeSeguro("///")).toBe("arquivo");
  });
});

describe("caminhoAnexoTarefa", () => {
  it("monta o caminho com prefixo e nome saneado", () => {
    expect(caminhoAnexoTarefa("t1", "Nota Fiscal.png", "abc")).toBe("tarefas/t1/abc-Nota_Fiscal.png");
  });
});
