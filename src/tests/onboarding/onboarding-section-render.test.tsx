import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(app)/clientes/[id]/onboarding", () => ({
  iniciarOnboarding: vi.fn(),
  salvarItemOnboarding: vi.fn(),
  removerItemOnboarding: vi.fn(),
  revelarSenha: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingSection } from "@/components/onboarding/OnboardingSection";
import type { ItemClienteView } from "@/app/(app)/clientes/[id]/onboarding";

const prog = { total: 2, concluidos: 1, obrigatoriosPendentes: 1, pct: 50, concluido: false };
const itens: ItemClienteView[] = [
  { id: "1", categoria: "documento", nome: "Contrato social", obrigatorio: true, ordem: 1, status: "concluido", responsavelId: null, prazo: null, observacao: null, acessoUrl: null, acessoLogin: null, temSenha: false },
  { id: "2", categoria: "acesso", nome: "e-CAC", obrigatorio: true, ordem: 1, status: "pendente", responsavelId: null, prazo: "2026-08-01", observacao: null, acessoUrl: "https://cav.receita.fazenda.gov.br", acessoLogin: "12345", temSenha: true },
];

describe("OnboardingSection", () => {
  it("estado vazio mostra iniciar", () => {
    const html = renderToStaticMarkup(<OnboardingSection clienteId="c1" itens={[]} progresso={{ total: 0, concluidos: 0, obrigatoriosPendentes: 0, pct: 0, concluido: false }} usuarios={[]} podeRevelar={false} />);
    expect(html).toContain("Iniciar onboarding");
  });
  it("com itens mostra categorias e progresso", () => {
    const html = renderToStaticMarkup(<OnboardingSection clienteId="c1" itens={itens} progresso={prog} usuarios={[]} podeRevelar />);
    expect(html).toContain("Contrato social");
    expect(html).toContain("e-CAC");
    expect(html).toContain("50%");
  });
});
