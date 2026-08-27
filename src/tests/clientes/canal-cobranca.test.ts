import { describe, it, expect } from "vitest";
import { canalParaFlags, flagsParaCanal, naoEnviaHonorario } from "@/lib/clientes/canal-cobranca";

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
  it("nao_enviar desliga os dois", () => {
    expect(canalParaFlags("nao_enviar")).toEqual({ whatsapp: false, email: false });
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
  it("os dois desligados explicitamente = nao_enviar", () => {
    expect(flagsParaCanal({ whatsapp: false, email: false })).toBe("nao_enviar");
  });
  it("round-trip das 4 opções", () => {
    for (const c of ["whatsapp", "email", "ambos", "nao_enviar"] as const) {
      expect(flagsParaCanal(canalParaFlags(c))).toBe(c);
    }
  });
});

describe("naoEnviaHonorario", () => {
  it("verdadeiro só com os dois canais desligados", () => {
    expect(naoEnviaHonorario({ whatsapp: false, email: false })).toBe(true);
    expect(naoEnviaHonorario({ whatsapp: true, email: false })).toBe(false);
    expect(naoEnviaHonorario({ whatsapp: false, email: true })).toBe(false);
    expect(naoEnviaHonorario({})).toBe(false); // nulos = ligados (default histórico)
  });
});
