import { describe, it, expect } from "vitest";
import { deveAvisar } from "@/lib/legalizacao/aviso";

const cfg = { ativo: true, canal: "email" as const };
const etapa = { avisarCliente: true, jaAvisado: false, concluida: true };

describe("deveAvisar", () => {
  it("avisa quando tudo alinha", () => {
    expect(deveAvisar(cfg, true, etapa)).toBe(true);
  });
  it("não avisa se o mestre está off, o cliente opta por não, a etapa não pede, não concluída ou já avisada", () => {
    expect(deveAvisar({ ...cfg, ativo: false }, true, etapa)).toBe(false);
    expect(deveAvisar(cfg, false, etapa)).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, avisarCliente: false })).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, concluida: false })).toBe(false);
    expect(deveAvisar(cfg, true, { ...etapa, jaAvisado: true })).toBe(false);
  });
});
