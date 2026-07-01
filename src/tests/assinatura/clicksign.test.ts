import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { enviarParaAssinatura } from "@/lib/assinatura/clicksign";

beforeEach(() => {
  vi.stubEnv("CLICKSIGN_URL", "https://sandbox.clicksign.com/api/v3");
  vi.stubEnv("CLICKSIGN_TOKEN", "tok_test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respJson(obj: unknown, status = 201) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/vnd.api+json" },
  });
}

describe("enviarParaAssinatura", () => {
  it("cria envelope, documento, signatários, requisitos e ativa", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method!,
          body: init.body ? JSON.parse(init.body as string) : null,
        });
        if (url.endsWith("/envelopes")) return respJson({ data: { id: "env1" } });
        if (url.endsWith("/documents")) return respJson({ data: { id: "doc1" } });
        if (url.endsWith("/signers")) return respJson({ data: { id: "sig-" + calls.length } });
        if (url.endsWith("/requirements")) return respJson({ data: { id: "req" } });
        if (url.endsWith("/notifications")) return respJson({ data: { id: "notif" } });
        if (init.method === "PATCH")
          return respJson({ data: { id: "env1", attributes: { status: "running" } } }, 200);
        return respJson({}, 200);
      }),
    );
    const out = await enviarParaAssinatura({
      pdf: Buffer.from("%PDF-1.4 fake"),
      nome: "Contrato ACME",
      signatarios: [
        { nome: "Cliente", email: "c@ex.com", papel: "contratante" },
        { nome: "Escritório", email: "e@ex.com", papel: "contratada" },
      ],
    });
    expect(out.envelopeId).toBe("env1");
    expect(out.documentId).toBe("doc1");
    expect(out.signatarios).toHaveLength(2);
    expect(out.signatarios[0]!.clicksignKey).toMatch(/^sig-/);
    const docCall = calls.find((c) => c.url.endsWith("/documents"))!;
    expect((docCall.body as { data: { attributes: { content_base64: string } } }).data.attributes.content_base64).toMatch(
      /^data:application\/pdf;base64,/,
    );
    expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    // dispara as notificações (senão os e-mails não saem)
    expect(calls.some((c) => c.url.endsWith("/notifications"))).toBe(true);
  });

  it("lança erro se a API responder falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respJson({ errors: [{ detail: "x" }] }, 422)),
    );
    await expect(
      enviarParaAssinatura({
        pdf: Buffer.from("x"),
        nome: "N",
        signatarios: [{ nome: "A", email: "a@x.com", papel: "contratante" }],
      }),
    ).rejects.toThrow();
  });
});
