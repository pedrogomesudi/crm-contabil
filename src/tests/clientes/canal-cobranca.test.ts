import { describe, it, expect } from "vitest";
import { canalParaFlags, flagsParaCanal } from "@/lib/clientes/canal-cobranca";

describe("canalParaFlags", () => {
  it("whatsapp liga só WhatsApp", () => {
    expect(canalParaFlags("whatsapp")).toEqual({ whatsapp: true, email: false });
  });
  it("email liga só e-mail", () => {
    expect(canalParaFlags("email")).toEqual({ whatsapp: false, email: true });
  });
  it("ambos liga os dois", () => {
    expect(canalParaFlags("ambos")).toEqual({ whatsapp: true, email: true });
  });
});

describe("flagsParaCanal", () => {
  it("mapeia cada combinação", () => {
    expect(flagsParaCanal({ whatsapp: true, email: false })).toBe("whatsapp");
    expect(flagsParaCanal({ whatsapp: false, email: true })).toBe("email");
    expect(flagsParaCanal({ whatsapp: true, email: true })).toBe("ambos");
  });
  it("flags nulos (legado) caem em ambos", () => {
    expect(flagsParaCanal({})).toBe("ambos");
    expect(flagsParaCanal({ whatsapp: null, email: null })).toBe("ambos");
  });
  it("os dois desligados (legado/silenciado) lê como ambos, sem seletor vazio", () => {
    expect(flagsParaCanal({ whatsapp: false, email: false })).toBe("ambos");
  });
  it("round-trip das 3 opções", () => {
    for (const c of ["whatsapp", "email", "ambos"] as const) {
      expect(flagsParaCanal(canalParaFlags(c))).toBe(c);
    }
  });
});
