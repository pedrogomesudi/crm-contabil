import { describe, it, expect } from "vitest";
import { podeExcluirCliente } from "@/lib/clientes/permissoes";

describe("podeExcluirCliente", () => {
  it("permite apenas admin", () => {
    expect(podeExcluirCliente("admin")).toBe(true);
  });
  it("nega os demais papéis e undefined", () => {
    expect(podeExcluirCliente("financeiro")).toBe(false);
    expect(podeExcluirCliente("assistente")).toBe(false);
    expect(podeExcluirCliente("contador")).toBe(false);
    expect(podeExcluirCliente(undefined)).toBe(false);
  });
});
