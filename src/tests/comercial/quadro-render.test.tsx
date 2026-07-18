import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/comercial/actions", () => ({
  criarOportunidade: vi.fn(),
  salvarOportunidade: vi.fn(),
  definirEtapa: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { QuadroComercial } from "@/app/(app)/comercial/QuadroComercial";
import type { OportunidadeView } from "@/app/(app)/comercial/actions";
import type { Etapa } from "@/lib/comercial/funil";

const ETAPAS: Etapa[] = [
  { id: "e1", rotulo: "Novo", ordem: 1, cor: "#000", probabilidade: 0.2 },
  { id: "e2", rotulo: "Contato feito", ordem: 2, cor: "#000", probabilidade: 0.4 },
  { id: "e3", rotulo: "Proposta enviada", ordem: 3, cor: "#000", probabilidade: 0.6 },
  { id: "e4", rotulo: "Negociação", ordem: 4, cor: "#000", probabilidade: 0.8 },
];

const ops: OportunidadeView[] = [
  {
    id: "1",
    prospectNome: "Padaria Sol",
    contatoNome: "João",
    contatoTelefone: null,
    contatoEmail: null,
    origem: "Indicação",
    servicoInteresse: "Abertura",
    valorEstimado: 400,
    responsavelId: "u1",
    responsavelNome: "Ana",
    etapa: "e1",
    etapaDesde: "2026-07-01T12:00:00.000Z",
    segmento: null,
    regime: null,
    observacoes: null,
    motivoPerda: null,
    clienteId: null,
    meu: true,
    criadoEm: "2026-07-01T12:00:00.000Z",
    fechadoEm: null,
  },
  {
    id: "2",
    prospectNome: "Tech XY",
    contatoNome: null,
    contatoTelefone: null,
    contatoEmail: null,
    origem: null,
    servicoInteresse: null,
    valorEstimado: 900,
    responsavelId: null,
    responsavelNome: null,
    etapa: "ganho",
    etapaDesde: "2026-07-01T12:00:00.000Z",
    segmento: null,
    regime: null,
    observacoes: null,
    motivoPerda: null,
    clienteId: null,
    meu: false,
    criadoEm: "2026-07-01T12:00:00.000Z",
    fechadoEm: "2026-07-05T12:00:00.000Z",
  },
];

describe("QuadroComercial", () => {
  it("renderiza colunas e card ativo", () => {
    const html = renderToStaticMarkup(
      <QuadroComercial oportunidades={ops} usuarios={[{ id: "u1", nome: "Ana" }]} etapas={ETAPAS} />,
    );
    expect(html).toContain("Novo");
    expect(html).toContain("Negociação");
    expect(html).toContain("Padaria Sol");
    expect(html).toContain('draggable="true"');
  });
  it("mostra seção de fechados", () => {
    const html = renderToStaticMarkup(<QuadroComercial oportunidades={ops} usuarios={[]} etapas={ETAPAS} />);
    expect(html).toContain("Fechados");
  });
});
