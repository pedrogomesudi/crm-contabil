import { describe, it, expect } from "vitest";
import { linhasBaixaBoleto } from "@/lib/boleto/baixar";

describe("linhasBaixaBoleto", () => {
  it("individual: uma baixa no título, pelo valor recebido", () => {
    expect(linhasBaixaBoleto({ titulo_id: "t1", grupo_cobranca_id: null }, [], 300)).toEqual([
      { tituloId: "t1", valor: 300 },
    ]);
  });
  it("grupo: uma baixa por título ligado, pelo valor de cada", () => {
    const lig = [
      { titulo_id: "a", valor: 200 },
      { titulo_id: "b", valor: 150 },
    ];
    expect(linhasBaixaBoleto({ titulo_id: null, grupo_cobranca_id: "g1" }, lig, 0)).toEqual([
      { tituloId: "a", valor: 200 },
      { tituloId: "b", valor: 150 },
    ]);
  });
  it("individual sem título: nenhuma baixa", () => {
    expect(linhasBaixaBoleto({ titulo_id: null, grupo_cobranca_id: null }, [], 100)).toEqual([]);
  });
});
