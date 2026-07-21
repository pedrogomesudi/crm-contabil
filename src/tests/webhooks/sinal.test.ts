import { describe, it, expect } from "vitest";
import { assinar, proximoRetry, endpointsParaEvento } from "@/lib/webhooks/sinal";

describe("assinar", () => {
  it("é determinístico e hex de 64 chars", () => {
    const a = assinar("segredo", '{"x":1}');
    expect(a).toBe(assinar("segredo", '{"x":1}'));
    expect(a).toHaveLength(64);
    expect(assinar("outro", '{"x":1}')).not.toBe(a);
  });
});

describe("proximoRetry", () => {
  it("cresce exponencialmente e satura", () => {
    expect(proximoRetry(1)).toBe(60);
    expect(proximoRetry(2)).toBe(300);
    expect(proximoRetry(3)).toBe(1800);
    expect(proximoRetry(99)).toBe(3600); // teto
  });
});

describe("endpointsParaEvento", () => {
  const eps = [
    { id: "a", eventos: ["titulo.pago", "cliente.criado"], ativo: true },
    { id: "b", eventos: ["titulo.pago"], ativo: false },
    { id: "c", eventos: ["obrigacao.entregue"], ativo: true },
  ];
  it("retorna só os ativos que assinam o evento", () => {
    expect(endpointsParaEvento(eps, "titulo.pago").map((e) => e.id)).toEqual(["a"]);
    expect(endpointsParaEvento(eps, "documento.enviado")).toEqual([]);
  });
});
