import { describe, it, expect, vi } from "vitest";
import { montarEnvioTextoOficial, criarAdaptadorOficial } from "@/lib/whatsapp/oficial";

const CFG = { phoneNumberId: "123456", token: "TKN" };

describe("montarEnvioTextoOficial", () => {
  it("monta URL, Bearer e corpo de texto (Cloud API)", () => {
    const req = montarEnvioTextoOficial(CFG, "5511999999999", "oi");
    expect(req.url).toBe("https://graph.facebook.com/v21.0/123456/messages");
    expect(req.headers.Authorization).toBe("Bearer TKN");
    const body = JSON.parse(req.body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "5511999999999", type: "text" });
    expect(body.text.body).toBe("oi");
  });

  it("respeita versão custom", () => {
    expect(montarEnvioTextoOficial({ ...CFG, versao: "v22.0" }, "5511", "x").url).toContain("/v22.0/");
  });
});

describe("criarAdaptadorOficial", () => {
  it("satisfaz a interface; enviarMidia ainda não disponível", async () => {
    const a = criarAdaptadorOficial(CFG);
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
    const m = await a.enviarMidia("5511", { tipo: "document", base64: "", mime: "application/pdf", nome: "x", caption: "" });
    expect(m.ok).toBe(false);
  });

  it("enviarTexto: HTTP 200 → ok; HTTP 4xx → erro", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid" }] }), { status: 200 }));
    const ok = await criarAdaptadorOficial(CFG).enviarTexto("5511", "oi");
    expect(ok.ok).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 400 }));
    const bad = await criarAdaptadorOficial(CFG).enviarTexto("5511", "oi");
    expect(bad.ok).toBe(false);
    expect(bad.erro).toContain("400");
    fetchMock.mockRestore();
  });
});
