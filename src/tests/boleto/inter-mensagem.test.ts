import { describe, it, expect } from "vitest";
import { corpoCobrancaInter } from "@/lib/boleto/inter";
import type { DadosEmissao } from "@/lib/boleto/tipos";

const base: DadosEmissao = {
  valor: 100,
  vencimento: "2026-09-10",
  pagadorNome: "ACME LTDA",
  pagadorDocumento: "12345678000190",
  pagadorEmail: null,
  descricao: "Honorários",
  seuNumero: "1",
};

describe("corpoCobrancaInter — mensagem/observações", () => {
  it("sem observações não inclui mensagem", () => {
    expect("mensagem" in corpoCobrancaInter(base)).toBe(false);
  });
  it("inclui mensagem com linha1..N", () => {
    const c = corpoCobrancaInter({ ...base, observacoes: ["EMPRESA A — 1", "EMPRESA B — 2"] }) as {
      mensagem: Record<string, string>;
    };
    expect(c.mensagem.linha1).toBe("EMPRESA A — 1");
    expect(c.mensagem.linha2).toBe("EMPRESA B — 2");
    expect(c.mensagem.linha3).toBeUndefined();
  });
  it("corta em 5 linhas e trunca cada uma a 78 chars", () => {
    const longa = "X".repeat(120);
    const obs = Array.from({ length: 8 }, () => longa);
    const c = corpoCobrancaInter({ ...base, observacoes: obs }) as { mensagem: Record<string, string> };
    expect(Object.keys(c.mensagem)).toHaveLength(5);
    expect(c.mensagem.linha1?.length).toBe(78);
    expect(c.mensagem.linha5).toBeDefined();
    expect(c.mensagem.linha6).toBeUndefined();
  });
});
