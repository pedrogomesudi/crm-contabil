import { describe, it, expect } from "vitest";
import { alvoDaBusca, escapeLike } from "@/lib/clientes/busca";

describe("escapeLike", () => {
  it("torna os curingas do LIKE literais", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c\\d")).toBe("c\\\\d");
  });
});

describe("alvoDaBusca", () => {
  it("texto busca por razão social", () => {
    expect(alvoDaBusca("Acme")).toEqual({ coluna: "razao_social", termo: "Acme" });
  });
  it("dígitos com pontuação de documento buscam por CPF/CNPJ, só os dígitos", () => {
    expect(alvoDaBusca("12.345.678/0001-90")).toEqual({
      coluna: "cpf_cnpj",
      termo: "12345678000190",
    });
  });
  it("poucos dígitos ainda são tratados como nome (evita casar meio mundo)", () => {
    expect(alvoDaBusca("12").coluna).toBe("razao_social");
  });
});
