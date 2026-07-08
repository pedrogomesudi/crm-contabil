import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/clientes/[id]/processo", () => ({ iniciarProcesso: vi.fn(), salvarProcessoItem: vi.fn(), removerProcessoItem: vi.fn(), revelarSenha: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import type { ItemProcessoView } from "@/app/(app)/clientes/[id]/processo";

const prog = { total: 2, concluidos: 1, bloqueantesPendentes: 1, pct: 50, concluido: false, proximoPrazo: "2026-07-20" };
const itens: ItemProcessoView[] = [
  { id: "1", blocoOrdem: 1, blocoNome: "Formalização da relação", codigo: "1.1", titulo: "Contrato assinado", descricao: null, tipo: "padrao", responsavelPapel: "admin", responsavelId: null, prazo: "2026-07-01", status: "concluido", observacao: null, bloqueante: true, anexoObrigatorio: true, alertaRisco: null, ordem: 1, acessoUrl: null, acessoLogin: null, temSenha: false },
  { id: "2", blocoOrdem: 3, blocoNome: "Acessos", codigo: "3.5", titulo: "Cofre de acessos", descricao: null, tipo: "acesso", responsavelPapel: "assistente", responsavelId: null, prazo: "2026-07-20", status: "pendente", observacao: null, bloqueante: false, anexoObrigatorio: false, alertaRisco: null, ordem: 5, acessoUrl: "https://cav.receita.fazenda.gov.br", acessoLogin: "123", temSenha: true },
];

describe("ProcessoSection", () => {
  it("sem processo mostra iniciar", () => {
    const html = renderToStaticMarkup(<ProcessoSection clienteId="c1" processo={null} itens={[]} progresso={{ total: 0, concluidos: 0, bloqueantesPendentes: 0, pct: 0, concluido: false, proximoPrazo: null }} usuarios={[]} podeRevelar={false} perfilSugerido="simples_sem_func" hoje="2026-07-08" />);
    expect(html).toContain("Iniciar processo");
  });
  it("com processo mostra blocos e itens", () => {
    const html = renderToStaticMarkup(<ProcessoSection clienteId="c1" processo={{ id: "p1", perfil: "simples_com_func", dataInicio: "2026-07-01", status: "em_andamento" }} itens={itens} progresso={prog} usuarios={[]} podeRevelar perfilSugerido="simples_com_func" hoje="2026-07-08" />);
    expect(html).toContain("Formalização da relação");
    expect(html).toContain("Contrato assinado");
    expect(html).toContain("50%");
  });
});
