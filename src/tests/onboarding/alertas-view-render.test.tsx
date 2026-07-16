import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertasView } from "@/app/(app)/onboarding/alertas/AlertasView";
import type { AlertaView } from "@/app/(app)/onboarding/alertas-actions";

const alertas: AlertaView[] = [
  {
    itemId: "1",
    clienteId: "c1",
    razaoSocial: "DGX LTDA",
    blocoNome: "Transição",
    codigo: "4.7",
    titulo: "Passivos ocultos",
    prazo: "2026-07-01",
    severidade: "critico",
    bloqueante: false,
    responsavelNome: "Ana",
    meu: true,
  },
  {
    itemId: "2",
    clienteId: "c2",
    razaoSocial: "ACME LTDA",
    blocoNome: "Formalização",
    codigo: "1.1",
    titulo: "Contrato",
    prazo: "2026-07-12",
    severidade: "em_breve",
    bloqueante: true,
    responsavelNome: null,
    meu: false,
  },
];

describe("AlertasView", () => {
  it("vazio", () => {
    expect(renderToStaticMarkup(<AlertasView alertas={[]} />)).toContain("Nenhum alerta");
  });
  it("agrupa por severidade", () => {
    const html = renderToStaticMarkup(<AlertasView alertas={alertas} />);
    expect(html).toContain("Passivos ocultos");
    expect(html).toContain("Contrato");
    expect(html).toContain("Crítico");
  });
});
