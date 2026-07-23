import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/obrigacoes/actions", () => ({ aplicarDoPadrao: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { PainelDivergencias, SeloRevisao } from "@/components/obrigacoes/CuradoriaMatriz";

describe("PainelDivergencias", () => {
  it("some quando a matriz está igual ao padrão", () => {
    const html = renderToStaticMarkup(<PainelDivergencias diff={{ ausentes: [], divergentes: [] }} />);
    expect(html).toBe("");
  });

  it("mostra o valor de cá e o de lá, com o rótulo do campo em português", () => {
    const html = renderToStaticMarkup(
      <PainelDivergencias
        diff={{
          ausentes: [],
          divergentes: [{ codigo: "DCTFWEB", campo: "vencDia", noBanco: 20, noPadrao: 15 }],
        }}
      />,
    );
    expect(html).toContain("DCTFWEB");
    expect(html).toContain("dia do vencimento");
    expect(html).toContain("20");
    expect(html).toContain("15");
    expect(html).toContain("Aplicar");
  });

  it("código ausente é apontado como caso de semear, não de aplicar", () => {
    const html = renderToStaticMarkup(<PainelDivergencias diff={{ ausentes: ["DIRBI"], divergentes: [] }} />);
    expect(html).toContain("DIRBI");
    expect(html).toContain("Semear matriz padrão");
  });
});

describe("SeloRevisao", () => {
  it("distingue os três estados", () => {
    const nunca = renderToStaticMarkup(<SeloRevisao estado="nunca" revisadaEm={null} revisadaPorNome={null} />);
    expect(nunca).toContain("nunca revisada");

    const vencida = renderToStaticMarkup(
      <SeloRevisao estado="vencida" revisadaEm="2024-01-10" revisadaPorNome="Ana" />,
    );
    expect(vencida).toContain("conferir");
    expect(vencida).toContain("10/01/2024");

    const emDia = renderToStaticMarkup(<SeloRevisao estado="em_dia" revisadaEm="2026-07-01" revisadaPorNome="Ana" />);
    expect(emDia).toContain("revisada");
  });
});
