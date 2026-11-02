import { describe, it, expect } from "vitest";
import { boletoIncompleto, camposACompletar } from "@/lib/boleto/completar";

const b = (nosso: string | null, linha: string | null, pix: string | null = "pix") => ({
  nosso_numero: nosso,
  linha_digitavel: linha,
  pix_copia_cola: pix,
});

describe("boletoIncompleto", () => {
  it("sem linha digitável está incompleto — não dá para o cliente pagar", () => {
    expect(boletoIncompleto(b("123", null))).toBe(true);
  });
  it("sem nosso número está incompleto", () => {
    expect(boletoIncompleto(b(null, "0001"))).toBe(true);
  });
  it("com linha e nosso número está completo, mesmo sem PIX", () => {
    expect(boletoIncompleto(b("123", "0001", null))).toBe(false);
  });
});

describe("camposACompletar", () => {
  it("preenche só o que falta", () => {
    expect(
      camposACompletar(b("123", null, null), { nossoNumero: "999", linhaDigitavel: "0001", pixCopiaCola: "p" }),
    ).toEqual({
      linha_digitavel: "0001",
      pix_copia_cola: "p",
    });
  });

  it("nunca sobrescreve o que já está gravado — é o que foi ao cliente", () => {
    expect(
      camposACompletar(b("123", "ORIGINAL", "pix"), {
        nossoNumero: "999",
        linhaDigitavel: "OUTRA",
        pixCopiaCola: "outro",
      }),
    ).toEqual({});
  });

  it("provedor ainda sem o dado não gera atualização vazia", () => {
    expect(
      camposACompletar(b(null, null, null), { nossoNumero: null, linhaDigitavel: null, pixCopiaCola: null }),
    ).toEqual({});
  });
});
