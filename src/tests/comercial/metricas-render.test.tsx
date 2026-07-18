import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricasFunil } from "@/app/(app)/comercial/MetricasFunil";
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
    prospectNome: "A",
    contatoNome: null,
    contatoTelefone: null,
    contatoEmail: null,
    origem: null,
    servicoInteresse: null,
    valorEstimado: 500,
    responsavelId: "u1",
    responsavelNome: "Ana",
    etapa: "e3",
    etapaDesde: "2026-07-01T00:00:00.000Z",
    segmento: null,
    regime: null,
    observacoes: null,
    motivoPerda: null,
    clienteId: null,
    meu: true,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: null,
  },
  {
    id: "2",
    prospectNome: "B",
    contatoNome: null,
    contatoTelefone: null,
    contatoEmail: null,
    origem: null,
    servicoInteresse: null,
    valorEstimado: 1000,
    responsavelId: "u1",
    responsavelNome: "Ana",
    etapa: "ganho",
    etapaDesde: "2026-07-01T00:00:00.000Z",
    segmento: null,
    regime: null,
    observacoes: null,
    motivoPerda: null,
    clienteId: null,
    meu: true,
    criadoEm: "2026-07-01T00:00:00.000Z",
    fechadoEm: "2026-07-10T00:00:00.000Z",
  },
];

describe("MetricasFunil", () => {
  it("renderiza pipeline e período", () => {
    const html = renderToStaticMarkup(<MetricasFunil oportunidades={ops} etapas={ETAPAS} hoje="2026-07-08" />);
    expect(html).toContain("Pipeline");
    expect(html).toContain("Taxa de conversão");
  });
});
