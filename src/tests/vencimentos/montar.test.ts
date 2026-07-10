import { describe, it, expect } from "vitest";
import { montarItens } from "@/lib/vencimentos/montar";

const HOJE = "2026-07-09";

describe("montarItens", () => {
  const itens = montarItens(
    {
      certificados: [
        { id: "c1", tipo: "A1", titular: "Fulano", validade: "2026-07-20", clienteId: "x", clienteNome: "ACME" },
      ],
      procuracoes: [
        { id: "p1", orgao: "e-CAC", outorgante: "Fulano", validade: "2026-08-01", clienteId: "x", clienteNome: "ACME" },
      ],
      nfse: [
        { clienteId: "x", validade: "2026-07-30", origem: "nfse_cliente", clienteNome: "ACME" },
        { clienteId: null, validade: "2026-07-31", origem: "nfse_escritorio", clienteNome: "Escritório" },
      ],
    },
    HOJE,
  );

  it("marca editavel: false SOMENTE nas linhas da NFS-e", () => {
    const naoEditaveis = itens.filter((i) => !i.editavel).map((i) => i.origem);
    expect(naoEditaveis).toEqual(["nfse", "nfse"]);
    expect(itens.filter((i) => i.editavel).every((i) => i.origem !== "nfse")).toBe(true);
  });

  it("classifica a severidade de cada linha pela validade", () => {
    expect(itens.find((i) => i.id === "c1")?.severidade).toBe("critico"); // 11 dias
    expect(itens.find((i) => i.id === "p1")?.severidade).toBe("alerta"); // 23 dias
  });

  it("o certificado do escritório vem sem cliente e rotulado", () => {
    const esc = itens.find((i) => i.clienteId === null);
    expect(esc?.clienteNome).toBe("Escritório");
    expect(esc?.titulo).toBe("Certificado A1 (NFS-e)");
  });
});
