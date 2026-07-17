import { describe, it, expect } from "vitest";
import { normalizarTelefone, chaveTelefone, chaveDeNumeroCompleto, aplicarTemplate } from "@/lib/whatsapp/mensagem";

describe("chaveTelefone (nono dígito)", () => {
  it("13 dígitos (com 9) → inalterado", () => {
    expect(chaveTelefone("5534988403020")).toBe("5534988403020");
  });
  it("12 dígitos (sem 9) → insere o 9", () => {
    expect(chaveTelefone("553488403020")).toBe("5534988403020");
    expect(chaveTelefone("551188887777")).toBe("5511988887777");
  });
  it("formato bruto de 11 díg (DDD+9+8) → 13 com 9", () => {
    expect(chaveTelefone("(34) 98840-3020")).toBe("5534988403020");
  });
  it("formato bruto de 10 díg (DDD+8) → insere o 9", () => {
    expect(chaveTelefone("(34) 8840-3020")).toBe("5534988403020");
  });
  it("inválido → null", () => {
    expect(chaveTelefone("123")).toBe(null);
  });
});

describe("normalizarTelefone", () => {
  it("adiciona DDI 55 a números BR de 10–11 dígitos", () => {
    expect(normalizarTelefone("(34) 99999-8888")).toBe("5534999998888");
    expect(normalizarTelefone("3433001774")).toBe("553433001774");
  });
  it("mantém quando já tem 55", () => {
    expect(normalizarTelefone("55 34 99999-8888")).toBe("5534999998888");
  });
  it("inválido => null", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });
});

describe("normalizarTelefone — internacional", () => {
  it("DDI explícito monta ddi + número", () => {
    expect(normalizarTelefone("555 123 4567", "1")).toBe("15551234567"); // EUA
    expect(normalizarTelefone("912 345 678", "351")).toBe("351912345678"); // Portugal
  });
  it("sem DDI, assume 55 (comportamento atual)", () => {
    expect(normalizarTelefone("(34) 99999-8888")).toBe("5534999998888");
  });
  it("número que JÁ vem com 55 e comprimento BR é respeitado (compat)", () => {
    expect(normalizarTelefone("5534999998888", "55")).toBe("5534999998888");
  });
  it("número curto/absurdo → null", () => {
    expect(normalizarTelefone("123", "1")).toBeNull();
    expect(normalizarTelefone("", "1")).toBeNull();
  });
  it("BR sem DDD (8–9 díg) continua rejeitado — contrato antigo preservado", () => {
    expect(normalizarTelefone("33445566")).toBeNull(); // 8 díg, sem DDD
    expect(normalizarTelefone("334455667")).toBeNull(); // 9 díg
  });
});

describe("chaveTelefone — só o BR ganha o nono dígito", () => {
  it("EUA (DDI 1) não insere o 9", () => {
    expect(chaveTelefone("5551234567", "1")).toBe("15551234567");
  });
  it("Portugal (DDI 351) não insere o 9", () => {
    expect(chaveTelefone("912345678", "351")).toBe("351912345678");
  });
  it("BR sem DDI continua ganhando o 9 (não-regressão)", () => {
    expect(chaveTelefone("(34) 8840-3020")).toBe("5534988403020");
  });
});

describe("chaveDeNumeroCompleto — número que JÁ vem com DDI (webhook)", () => {
  it("BR de 12 díg ganha o 9 (como chaveTelefone); 13 fica igual", () => {
    expect(chaveDeNumeroCompleto("553488403020")).toBe("5534988403020");
    expect(chaveDeNumeroCompleto("5534988403020")).toBe("5534988403020");
  });
  it("internacional NÃO ganha 55 na frente — o bug que a revisão achou", () => {
    expect(chaveDeNumeroCompleto("15551234567")).toBe("15551234567"); // EUA
    expect(chaveDeNumeroCompleto("351912345678")).toBe("351912345678"); // Portugal
  });
  it("casa com a chave do cliente (mesmo número, dois caminhos)", () => {
    // webhook recebe completo; cliente é montado de local + ddi. As chaves batem.
    expect(chaveDeNumeroCompleto("15551234567")).toBe(chaveTelefone("5551234567", "1"));
  });
  it("inválido → null", () => {
    expect(chaveDeNumeroCompleto("123")).toBeNull();
    expect(chaveDeNumeroCompleto("")).toBeNull();
  });
});

describe("aplicarTemplate", () => {
  it("substitui variáveis; ausente vira vazio", () => {
    expect(aplicarTemplate("Olá {nome}, {valor}", { nome: "ACME", valor: "R$ 10" })).toBe("Olá ACME, R$ 10");
    expect(aplicarTemplate("Oi {x}", {})).toBe("Oi ");
  });
});
