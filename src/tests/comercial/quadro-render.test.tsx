import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/actions", () => ({ criarOportunidade: vi.fn(), salvarOportunidade: vi.fn(), definirEtapa: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { QuadroComercial } from "@/app/(app)/comercial/QuadroComercial";
import type { OportunidadeView } from "@/app/(app)/comercial/actions";

const ops: OportunidadeView[] = [
  { id: "1", prospectNome: "Padaria Sol", contatoNome: "João", contatoTelefone: null, contatoEmail: null, origem: "Indicação", servicoInteresse: "Abertura", valorEstimado: 400, responsavelId: "u1", responsavelNome: "Ana", etapa: "novo", observacoes: null, motivoPerda: null, clienteId: null, meu: true, criadoEm: "2026-07-01T12:00:00.000Z", fechadoEm: null },
  { id: "2", prospectNome: "Tech XY", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 900, responsavelId: null, responsavelNome: null, etapa: "ganho", observacoes: null, motivoPerda: null, clienteId: null, meu: false, criadoEm: "2026-07-01T12:00:00.000Z", fechadoEm: "2026-07-05T12:00:00.000Z" },
];

describe("QuadroComercial", () => {
  it("renderiza colunas e card ativo", () => {
    const html = renderToStaticMarkup(<QuadroComercial oportunidades={ops} usuarios={[{ id: "u1", nome: "Ana" }]} />);
    expect(html).toContain("Novo");
    expect(html).toContain("Negociação");
    expect(html).toContain("Padaria Sol");
    expect(html).toContain('draggable="true"');
  });
  it("mostra seção de fechados", () => {
    const html = renderToStaticMarkup(<QuadroComercial oportunidades={ops} usuarios={[]} />);
    expect(html).toContain("Fechados");
  });
});
