import { describe, it, expect, vi } from "vitest";
import { criarAdaptadorZapi } from "@/lib/whatsapp/zapi";

describe("criarAdaptadorZapi", () => {
  it("expõe os 3 métodos da interface", () => {
    const a = criarAdaptadorZapi({ instance: "i", token: "t", clientToken: "c" });
    expect(typeof a.enviarTexto).toBe("function");
    expect(typeof a.enviarMidia).toBe("function");
    expect(typeof a.statusConexao).toBe("function");
  });

  it("enviarTexto delega ao fetch com a URL/headers da Z-API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const a = criarAdaptadorZapi({ instance: "inst", token: "tok", clientToken: "cli" });
    const r = await a.enviarTexto("5511999999999", "oi");
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/instances/inst/token/tok/send-text");
    expect((init as RequestInit).headers).toMatchObject({ "Client-Token": "cli" });
    fetchMock.mockRestore();
  });
});
