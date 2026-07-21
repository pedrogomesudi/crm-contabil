import { describe, it, expect } from "vitest";
import { gerarChave, hashChave, temEscopo } from "@/lib/api/chave";

describe("gerarChave", () => {
  it("gera chave sk_, prefixo de 10 chars e hash consistente", () => {
    const { chave, hash, prefixo } = gerarChave();
    expect(chave.startsWith("sk_")).toBe(true);
    expect(prefixo).toBe(chave.slice(0, 10));
    expect(hash).toBe(hashChave(chave));
    expect(hash).toHaveLength(64); // sha256 hex
  });
  it("gera chaves distintas a cada chamada", () => {
    expect(gerarChave().chave).not.toBe(gerarChave().chave);
  });
});

describe("hashChave", () => {
  it("é determinístico", () => {
    expect(hashChave("sk_abc")).toBe(hashChave("sk_abc"));
    expect(hashChave("sk_abc")).not.toBe(hashChave("sk_abd"));
  });
});

describe("temEscopo", () => {
  it("true quando o escopo está presente", () => {
    expect(temEscopo(["clientes:read"], "clientes:read")).toBe(true);
  });
  it("false quando ausente", () => {
    expect(temEscopo(["clientes:read"], "clientes:write")).toBe(false);
  });
  it("sem escopo necessário (ping) sempre passa", () => {
    expect(temEscopo([], undefined)).toBe(true);
  });
});
