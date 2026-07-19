import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FollowupProposta } from "@/app/(app)/comercial/propostas/[id]/FollowupProposta";
import type { PassoAgenda } from "@/lib/comercial/followup";

const passos: PassoAgenda[] = [
  { dias: 0, dataPrevista: "2026-07-01", situacao: "enviado", quando: "2026-07-01" },
  { dias: 3, dataPrevista: "2026-07-04", situacao: "pendente", quando: null },
  { dias: 7, dataPrevista: "2026-07-08", situacao: "agendado", quando: null },
];

describe("FollowupProposta", () => {
  it("mostra a agenda quando enviada", () => {
    const html = renderToStaticMarkup(<FollowupProposta enviada passos={passos} />);
    expect(html).toContain("Follow-up");
    expect(html).toContain("D+0");
    expect(html).toContain("D+3");
    expect(html).toContain("Enviado");
  });
  it("nota quando não enviada", () => {
    const html = renderToStaticMarkup(<FollowupProposta enviada={false} passos={[]} />);
    expect(html).toContain("O follow-up começa quando a proposta for enviada");
  });
});
