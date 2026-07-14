import { describe, it, expect } from "vitest";
import { SOLICITACAO_CATEGORIAS, SOLICITACAO_STATUS, prazoSla } from "@/lib/solicitacoes/solicitacao";

describe("solicitacao", () => {
  it("categorias e status rotulados", () => {
    expect(SOLICITACAO_CATEGORIAS).toHaveLength(4);
    expect(SOLICITACAO_STATUS).toHaveLength(4);
    expect(SOLICITACAO_CATEGORIAS.every((c) => c.rotulo.length > 0)).toBe(true);
  });
  it("prazoSla soma os dias à data", () => {
    expect(prazoSla("2026-07-14", 2)).toBe("2026-07-16");
    expect(prazoSla("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("prazoSla trata SLA zero/negativo como mesmo dia", () => {
    expect(prazoSla("2026-07-14", 0)).toBe("2026-07-14");
    expect(prazoSla("2026-07-14", -3)).toBe("2026-07-14");
  });
});
