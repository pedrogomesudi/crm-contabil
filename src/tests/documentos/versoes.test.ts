import { describe, it, expect } from "vitest";
import { agruparVersoes } from "@/lib/documentos/versoes";

const d = (id: string, substitui_id: string | null) => ({ id, substitui_id });

describe("agruparVersoes", () => {
  it("cadeia de 3 vira 1 atual + 2 anteriores (recente→antiga)", () => {
    const r = agruparVersoes([d("c", "b"), d("b", "a"), d("a", null)]);
    expect(r).toEqual([{ atual: d("c", "b"), anteriores: [d("b", "a"), d("a", null)] }]);
  });

  it("documentos sem versão viram grupos de 1", () => {
    const r = agruparVersoes([d("x", null), d("y", null)]);
    expect(r).toEqual([
      { atual: d("x", null), anteriores: [] },
      { atual: d("y", null), anteriores: [] },
    ]);
  });

  it("referência órfã não quebra (vira atual isolado)", () => {
    const r = agruparVersoes([d("c", "sumiu")]);
    expect(r).toEqual([{ atual: d("c", "sumiu"), anteriores: [] }]);
  });

  it("preserva a ordem de entrada dos atuais", () => {
    const r = agruparVersoes([d("y", null), d("c", "b"), d("b", null)]);
    expect(r.map((g) => g.atual.id)).toEqual(["y", "c"]);
  });
});
