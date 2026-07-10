import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarSerie } from "@/lib/reajuste/bacen";

afterEach(() => vi.unstubAllGlobals());

describe("buscarSerie", () => {
  it("faz o parse do JSON do BACEN", async () => {
    const payload = [{ data: "01/01/2026", valor: "1621.00" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const serie = await buscarSerie(1619, "01/12/2025", "01/01/2026");
    expect(serie).toEqual(payload);
  });
  it("lança em HTTP não-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    await expect(buscarSerie(1619, "01/12/2025", "01/01/2026")).rejects.toThrow();
  });
  it("propaga erro de rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    await expect(buscarSerie(1619, "01/12/2025", "01/01/2026")).rejects.toThrow();
  });
});
