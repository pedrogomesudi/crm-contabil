import { describe, it, expect } from "vitest";
import { avisoContratosNaoVinculados } from "@/lib/dominio/avisos";

describe("avisoContratosNaoVinculados", () => {
  it("alerta quando há contratos mas NENHUM vinculou (bug do arquivo errado)", () => {
    const aviso = avisoContratosNaoVinculados(78, 0);
    expect(aviso).toBeTruthy();
    expect(aviso).toMatch(/Clientes/); // aponta o relatório culpado
    expect(aviso).toMatch(/honor/i); // avisa do risco ao honorário
  });

  it("não alerta em vínculo parcial (contratos de clientes fora do lote são normais)", () => {
    expect(avisoContratosNaoVinculados(78, 40)).toBeNull();
  });

  it("não alerta quando não há arquivo de contratos", () => {
    expect(avisoContratosNaoVinculados(0, 0)).toBeNull();
  });

  it("não alerta quando todos vincularam", () => {
    expect(avisoContratosNaoVinculados(50, 50)).toBeNull();
  });
});
