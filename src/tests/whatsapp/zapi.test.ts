import { describe, it, expect } from "vitest";
import { montarEnvio } from "@/lib/whatsapp/zapi";

describe("montarEnvio", () => {
  it("monta URL, headers (Client-Token) e body do Z-API", () => {
    const r = montarEnvio({ instance: "INST", token: "TOK", clientToken: "CT" }, "5534999998888", "oi");
    expect(r.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-text");
    expect(r.headers["Client-Token"]).toBe("CT");
    expect(JSON.parse(r.body)).toEqual({ phone: "5534999998888", message: "oi" });
  });
});
