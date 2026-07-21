import { describe, it, expect } from "vitest";
import { decidirRate } from "@/lib/api/rate-limit";

describe("decidirRate", () => {
  it("primeira chamada abre a janela com contador 1", () => {
    const r = decidirRate(undefined, 1000, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado).toEqual({ janelaInicio: 1000, contador: 1 });
  });
  it("incrementa dentro da janela abaixo do limite", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 1 }, 1500, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado.contador).toBe(2);
  });
  it("bloqueia ao atingir o limite", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 3 }, 1500, 3, 60000);
    expect(r.permitido).toBe(false);
    expect(r.restanteMs).toBe(59500);
  });
  it("reinicia a janela quando ela expira", () => {
    const r = decidirRate({ janelaInicio: 1000, contador: 3 }, 62000, 3, 60000);
    expect(r.permitido).toBe(true);
    expect(r.estado).toEqual({ janelaInicio: 62000, contador: 1 });
  });
});
