import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/funil/actions", () => ({
  criarEtapa: vi.fn(),
  renomearEtapa: vi.fn(),
  recolorirEtapa: vi.fn(),
  definirProbabilidade: vi.fn(),
  reordenarEtapas: vi.fn(),
  arquivarEtapa: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { EtapasFunil } from "@/app/(app)/configuracoes/funil/EtapasFunil";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#8C938E", probabilidade: 0.2 },
  { id: "e2", rotulo: "Negociação", ordem: 2, cor: "#B5820E", probabilidade: 0.8 },
];

describe("EtapasFunil", () => {
  it("lista etapas ativas e os estados de sistema", () => {
    const html = renderToStaticMarkup(<EtapasFunil etapas={ETAPAS} />);
    expect(html).toContain("Novo");
    expect(html).toContain("Negociação");
    expect(html).toContain("Ganho"); // estado de sistema
    expect(html).toContain("Perdido"); // estado de sistema
    expect(html).toContain("Adicionar etapa");
  });
});
