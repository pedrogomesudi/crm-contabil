import { describe, it, expect } from "vitest";
import { ehCliente, ehEquipe } from "@/lib/portal/permissoes";

describe("portal/permissoes", () => {
  it("ehCliente só para cliente", () => {
    expect(ehCliente("cliente")).toBe(true);
    expect(ehCliente("admin")).toBe(false);
    expect(ehCliente(undefined)).toBe(false);
  });
  it("ehEquipe exclui cliente", () => {
    expect(ehEquipe("admin")).toBe(true);
    expect(ehEquipe("financeiro")).toBe(true);
    expect(ehEquipe("cliente")).toBe(false);
    expect(ehEquipe(undefined)).toBe(false);
  });
});
