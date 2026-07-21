import { describe, it, expect } from "vitest";
import { montarEnvelope, montarCabecalhos } from "@/lib/webhooks/enviar";
import { assinar } from "@/lib/webhooks/sinal";

describe("montarEnvelope", () => {
  it("extrai id/evento/criado_em/dados da linha da outbox", () => {
    const env = montarEnvelope({
      id: "e1",
      evento: "titulo.pago",
      criado_em: "2026-07-21T10:00:00Z",
      payload: { evento: "titulo.pago", dados: { valor: 10 } },
    });
    expect(env).toEqual({ id: "e1", evento: "titulo.pago", criado_em: "2026-07-21T10:00:00Z", dados: { valor: 10 } });
  });
});

describe("montarCabecalhos", () => {
  it("inclui id/timestamp/tentativa e assinatura do corpo", () => {
    const env = { id: "e1", evento: "titulo.pago", criado_em: "2026-07-21T10:00:00Z", dados: {} };
    const corpo = JSON.stringify(env);
    const h = montarCabecalhos(corpo, "segredo", env, 2);
    expect(h["X-Webhook-Id"]).toBe("e1");
    expect(h["X-Webhook-Timestamp"]).toBe("2026-07-21T10:00:00Z");
    expect(h["X-Webhook-Tentativa"]).toBe("2");
    expect(h["X-Assinatura"]).toBe(`sha256=${assinar("segredo", corpo)}`);
  });
});
