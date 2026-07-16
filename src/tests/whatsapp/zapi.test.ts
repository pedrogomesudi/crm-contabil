import { describe, it, expect } from "vitest";
import { montarEnvio, montarEnvioMidia } from "@/lib/whatsapp/zapi";

describe("montarEnvio", () => {
  it("monta URL, headers (Client-Token) e body do Z-API", () => {
    const r = montarEnvio({ instance: "INST", token: "TOK", clientToken: "CT" }, "5534999998888", "oi");
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-text");
    expect(r.headers["Client-Token"]).toBe("CT");
    expect(JSON.parse(r.body)).toEqual({ phone: "5534999998888", message: "oi" });
  });
});

describe("montarEnvioMidia", () => {
  const cfg = { instance: "INST", token: "TOK", clientToken: "CT" };
  it("imagem → send-image com data URI e caption", () => {
    const r = montarEnvioMidia(cfg, "5534999998888", {
      tipo: "image",
      base64: "AAAA",
      mime: "image/png",
      nome: "f.png",
      caption: "oi",
    });
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-image");
    expect(r.headers["Client-Token"]).toBe("CT");
    expect(JSON.parse(r.body)).toEqual({ phone: "5534999998888", image: "data:image/png;base64,AAAA", caption: "oi" });
  });
  it("documento → send-document/{ext} com fileName", () => {
    const r = montarEnvioMidia(cfg, "553400", {
      tipo: "document",
      base64: "BBBB",
      mime: "application/pdf",
      nome: "nota.pdf",
      caption: "",
    });
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-document/pdf");
    expect(JSON.parse(r.body)).toEqual({
      phone: "553400",
      document: "data:application/pdf;base64,BBBB",
      fileName: "nota.pdf",
      caption: "",
    });
  });
});
