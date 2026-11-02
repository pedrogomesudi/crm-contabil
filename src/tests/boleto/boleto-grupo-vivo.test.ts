import { describe, it, expect } from "vitest";
import { boletoBloqueiaReemissao } from "@/lib/boleto/cancelamento";

describe("boletoBloqueiaReemissao", () => {
  it("boleto emitido bloqueia — é a cobrança que está na rua", () => {
    expect(boletoBloqueiaReemissao("emitido")).toBe(true);
  });

  it("boleto pago bloqueia — reemitir cobraria duas vezes", () => {
    expect(boletoBloqueiaReemissao("pago")).toBe(true);
  });

  it("boleto cancelado NÃO bloqueia — é o que permite reemitir", () => {
    expect(boletoBloqueiaReemissao("cancelado")).toBe(false);
  });

  it("boleto com erro NÃO bloqueia — nunca chegou ao cliente", () => {
    expect(boletoBloqueiaReemissao("erro")).toBe(false);
  });

  it("status desconhecido bloqueia, por precaução", () => {
    expect(boletoBloqueiaReemissao("qualquer_coisa_nova")).toBe(true);
  });
});
