import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricasFunil } from "@/app/(app)/comercial/MetricasFunil";
import type { OportunidadeView } from "@/app/(app)/comercial/actions";

const ops: OportunidadeView[] = [
  { id: "1", prospectNome: "A", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 500, responsavelId: "u1", responsavelNome: "Ana", etapa: "proposta", observacoes: null, motivoPerda: null, clienteId: null, meu: true, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: null },
  { id: "2", prospectNome: "B", contatoNome: null, contatoTelefone: null, contatoEmail: null, origem: null, servicoInteresse: null, valorEstimado: 1000, responsavelId: "u1", responsavelNome: "Ana", etapa: "ganho", observacoes: null, motivoPerda: null, clienteId: null, meu: true, criadoEm: "2026-07-01T00:00:00.000Z", fechadoEm: "2026-07-10T00:00:00.000Z" },
];

describe("MetricasFunil", () => {
  it("renderiza pipeline e período", () => {
    const html = renderToStaticMarkup(<MetricasFunil oportunidades={ops} hoje="2026-07-08" />);
    expect(html).toContain("Pipeline");
    expect(html).toContain("Taxa de conversão");
  });
});
