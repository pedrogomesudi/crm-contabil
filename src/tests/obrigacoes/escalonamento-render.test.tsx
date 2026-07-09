import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EscalonamentoView } from "@/app/(app)/obrigacoes/escalonamento/EscalonamentoView";
import type { ItemEscalado } from "@/app/(app)/obrigacoes/escalonamento-actions";

const itens: ItemEscalado[] = [{ id: "1", clienteNome: "ACME LTDA", obrigacaoNome: "PGDAS-D", vencimentoInterno: "2026-07-01", diasAtraso: 20, nivel: 2, responsavelNome: "Maria" }];

describe("EscalonamentoView", () => {
  it("lista o item escalado com responsável e nível", () => {
    const html = renderToStaticMarkup(<EscalonamentoView itens={itens} ativo={true} />);
    expect(html).toContain("ACME LTDA");
    expect(html).toContain("Maria");
    expect(html).toContain("sócio");
  });
  it("avisa quando desativado", () => {
    const html = renderToStaticMarkup(<EscalonamentoView itens={[]} ativo={false} />);
    expect(html).toContain("desativado");
  });
});
