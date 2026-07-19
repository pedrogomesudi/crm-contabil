import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/login/actions", () => ({ sair: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/clientes" }));
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "@/components/Sidebar";

const ZERO = { onboarding: 0, riscos: 0, escalonamento: 0, vencimentos: 0, docsVencidos: 0 };

describe("Sidebar", () => {
  it("mostra os títulos de grupo", () => {
    const html = renderToStaticMarkup(<Sidebar papel="admin" nome="Pedro" badges={ZERO} />);
    for (const t of ["Operação", "Entrada", "Relacionamento", "Financeiro"]) {
      expect(html).toContain(t);
    }
  });

  it("não mostra o grupo Entrada para o papel financeiro", () => {
    const html = renderToStaticMarkup(<Sidebar papel="financeiro" nome="Ana" badges={ZERO} />);
    expect(html).not.toContain("Entrada");
    expect(html).toContain("Financeiro");
  });

  it("cada badge aparece no seu item", () => {
    const html = renderToStaticMarkup(
      <Sidebar papel="admin" nome="Pedro" badges={{ onboarding: 2, riscos: 3, escalonamento: 1, vencimentos: 5, docsVencidos: 0 }} />,
    );
    expect(html).toContain(">4<"); // Obrigações: riscos + escalonamento
    expect(html).toContain(">5<"); // Vencimentos
    expect(html).toContain(">2<"); // Onboarding
  });

  it("realça a rota atual (/clientes), e só ela", () => {
    const html = renderToStaticMarkup(<Sidebar papel="admin" nome="Pedro" badges={ZERO} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
