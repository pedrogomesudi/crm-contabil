import { describe, it, expect } from "vitest";
import { menuDoPapel, type Badges } from "@/lib/ui/navegacao";

const ZERO: Badges = {
  onboarding: 0,
  riscos: 0,
  escalonamento: 0,
  vencimentos: 0,
  docsVencidos: 0,
  monitoramentoReceita: 0,
};
const hrefs = (papel: Parameters<typeof menuDoPapel>[0], b: Badges = ZERO) =>
  menuDoPapel(papel, b).flatMap((g) => g.itens.map((i) => i.href));
const titulos = (papel: Parameters<typeof menuDoPapel>[0]) => menuDoPapel(papel, ZERO).map((g) => g.titulo);

describe("menuDoPapel", () => {
  it("admin vê todos os grupos", () => {
    expect(titulos("admin")).toEqual([null, "Operação", "Entrada", "Relacionamento", "Financeiro", null]);
  });

  it("financeiro NÃO vê o grupo Entrada — e o título não fica órfão", () => {
    expect(titulos("financeiro")).not.toContain("Entrada");
    expect(hrefs("financeiro")).not.toContain("/comercial");
    expect(hrefs("financeiro")).not.toContain("/onboarding");
  });

  it("contador não vê Financeiro (podeGerenciarFinanceiro é só admin/financeiro)", () => {
    expect(titulos("contador")).not.toContain("Financeiro");
    expect(hrefs("contador")).not.toContain("/financeiro/cadastros");
  });

  it("nenhum grupo renderizado vem vazio", () => {
    for (const papel of ["admin", "contador", "assistente", "financeiro"] as const) {
      for (const g of menuDoPapel(papel, ZERO)) {
        expect(g.itens.length).toBeGreaterThan(0);
      }
    }
  });

  it("Obrigações e Vencimentos são itens próprios — saíram de dentro de Clientes", () => {
    const h = hrefs("admin");
    expect(h).toContain("/obrigacoes");
    expect(h).toContain("/vencimentos");
  });

  it("cada badge fica no seu item, em vez de somado em Clientes", () => {
    const menu = menuDoPapel("admin", {
      onboarding: 2,
      riscos: 3,
      escalonamento: 1,
      vencimentos: 5,
      docsVencidos: 0,
      monitoramentoReceita: 0,
    });
    const item = (href: string) => menu.flatMap((g) => g.itens).find((i) => i.href === href);
    expect(item("/obrigacoes")?.badge).toBe(4); // riscos + escalonamento: os dois vivem em Obrigações
    expect(item("/vencimentos")?.badge).toBe(5);
    expect(item("/onboarding")?.badge).toBe(2);
    expect(item("/clientes")?.badge).toBeUndefined(); // não soma mais o que não é dele
  });

  it("badge zero não vira bolinha vazia", () => {
    const menu = menuDoPapel("admin", ZERO);
    expect(menu.flatMap((g) => g.itens).every((i) => i.badge === undefined)).toBe(true);
  });

  it("o papel financeiro continua vendo o que já via (Clientes, Tarefas, Timesheet, Atendimento)", () => {
    const h = hrefs("financeiro");
    for (const r of ["/", "/clientes", "/tarefas", "/timesheet", "/atendimento", "/financeiro/cadastros"]) {
      expect(h).toContain(r);
    }
  });
});
