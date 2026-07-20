import { describe, it, expect } from "vitest";
import { urlWebhookEsperada, verdictWebhook } from "@/lib/boleto/webhook";
import { extrairWebhookUrlInter } from "@/lib/boleto/inter";

describe("urlWebhookEsperada", () => {
  it("monta a URL e remove barra final do appUrl", () => {
    expect(urlWebhookEsperada("https://app.seusaldo.ai/", "abc")).toBe(
      "https://app.seusaldo.ai/api/webhooks/boleto/abc",
    );
  });
});

describe("verdictWebhook", () => {
  const esperada = "https://app.seusaldo.ai/api/webhooks/boleto/abc";
  it("ausente quando nada cadastrado", () => {
    expect(verdictWebhook(null, esperada)).toBe("ausente");
    expect(verdictWebhook("", esperada)).toBe("ausente");
  });
  it("ok quando bate", () => {
    expect(verdictWebhook(esperada, esperada)).toBe("ok");
  });
  it("divergente quando aponta para outro lugar", () => {
    expect(verdictWebhook("https://outro/hook", esperada)).toBe("divergente");
  });
});

describe("extrairWebhookUrlInter", () => {
  it("lê webhookUrl", () => {
    expect(extrairWebhookUrlInter({ webhookUrl: "https://x/y" })).toBe("https://x/y");
  });
  it("null quando ausente/vazio", () => {
    expect(extrairWebhookUrlInter({})).toBeNull();
    expect(extrairWebhookUrlInter({ webhookUrl: "" })).toBeNull();
  });
});
