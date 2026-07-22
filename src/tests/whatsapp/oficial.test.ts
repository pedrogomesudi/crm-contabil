import { describe, it, expect, vi } from "vitest";
import { montarEnvioTextoOficial, montarEnvioMidiaOficial, criarAdaptadorOficial } from "@/lib/whatsapp/oficial";

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
  it("satisfaz a interface", () => {
    const a = criarAdaptadorOficial(CFG);
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.enviarMidia).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
  });

  it("montarEnvioMidiaOficial: image e document referenciam o media id", () => {
    const img = montarEnvioMidiaOficial(CFG, "5511", "MID", {
      tipo: "image",
      base64: "",
      mime: "image/png",
      nome: "f.png",
      caption: "leg",
    });
    const bImg = JSON.parse(img.body);
    expect(bImg).toMatchObject({ messaging_product: "whatsapp", to: "5511", type: "image" });
    expect(bImg.image).toMatchObject({ id: "MID", caption: "leg" });

    const doc = montarEnvioMidiaOficial(CFG, "5511", "MID2", {
      tipo: "document",
      base64: "",
      mime: "application/pdf",
      nome: "nota.pdf",
      caption: "leg",
    });
    const bDoc = JSON.parse(doc.body);
    expect(bDoc.type).toBe("document");
    expect(bDoc.document).toMatchObject({ id: "MID2", filename: "nota.pdf", caption: "leg" });
  });

  it("enviarMidia: upload → media id → envio (200 = ok)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "MID" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid" }] }), { status: 200 }));
    const r = await criarAdaptadorOficial(CFG).enviarMidia("5511", {
      tipo: "document",
      base64: Buffer.from("pdf").toString("base64"),
      mime: "application/pdf",
      nome: "x.pdf",
      caption: "",
    });
    expect(r.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/123456/media");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/123456/messages");
    fetchMock.mockRestore();
  });

  it("enviarMidia: upload falha → erro (não tenta enviar)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }));
    const r = await criarAdaptadorOficial(CFG).enviarMidia("5511", {
      tipo: "image",
      base64: Buffer.from("x").toString("base64"),
      mime: "image/png",
      nome: "f.png",
      caption: "",
    });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
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
