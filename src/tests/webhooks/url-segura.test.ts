import { describe, it, expect } from "vitest";
import { urlWebhookSegura } from "@/lib/webhooks/url-segura";

describe("urlWebhookSegura", () => {
  it("aceita https público", () => {
    expect(urlWebhookSegura("https://webhook.site/abc").ok).toBe(true);
    expect(urlWebhookSegura("https://exemplo.com/hook").ok).toBe(true);
  });
  it("rejeita http (não-https)", () => {
    expect(urlWebhookSegura("http://exemplo.com").ok).toBe(false);
  });
  it("rejeita loopback e localhost", () => {
    expect(urlWebhookSegura("https://localhost/x").ok).toBe(false);
    expect(urlWebhookSegura("https://127.0.0.1/x").ok).toBe(false);
    expect(urlWebhookSegura("https://[::1]/x").ok).toBe(false);
  });
  it("rejeita o IP de metadados de cloud", () => {
    expect(urlWebhookSegura("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });
  it("rejeita faixas privadas", () => {
    expect(urlWebhookSegura("https://10.0.0.5/x").ok).toBe(false);
    expect(urlWebhookSegura("https://192.168.1.1/x").ok).toBe(false);
    expect(urlWebhookSegura("https://172.16.3.4/x").ok).toBe(false);
  });
  it("rejeita hostnames internos (.local/.internal) e URL inválida", () => {
    expect(urlWebhookSegura("https://servico.internal/x").ok).toBe(false);
    expect(urlWebhookSegura("https://impressora.local/x").ok).toBe(false);
    expect(urlWebhookSegura("não é url").ok).toBe(false);
  });
});
