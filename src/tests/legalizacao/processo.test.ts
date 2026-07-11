import { describe, it, expect } from "vitest";
import { LEGALIZACAO_TIPOS, LEGALIZACAO_ORGAOS, rotuloOrgao } from "@/lib/legalizacao/tipos";
import { materializarEtapas, progressoProcesso, tipoComprovante } from "@/lib/legalizacao/processo";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";

describe("tipos", () => {
  it("tem 7 tipos e 7 órgãos rotulados", () => {
    expect(LEGALIZACAO_TIPOS).toHaveLength(7);
    expect(LEGALIZACAO_ORGAOS).toHaveLength(7);
    expect(LEGALIZACAO_TIPOS.every((t) => t.rotulo.length > 0)).toBe(true);
  });
  it("rotuloOrgao usa o rótulo livre quando 'outro'", () => {
    expect(rotuloOrgao("junta")).toBe("Junta Comercial");
    expect(rotuloOrgao("outro", "JUCEMG")).toBe("JUCEMG");
    expect(rotuloOrgao("outro", null)).toBe("Outro");
  });
});

describe("materializarEtapas", () => {
  it("calcula prazo = data_inicio + prazo_dias e preserva ordem/campos", () => {
    const etapas = [
      { ordem: 1, titulo: "A", descricao: null, orgao: "junta" as const, prazoDias: 5, responsavelPapel: "contador", anexoObrigatorio: true, avisarCliente: false },
      { ordem: 2, titulo: "B", descricao: null, orgao: "receita" as const, prazoDias: null, responsavelPapel: null, anexoObrigatorio: false, avisarCliente: true },
    ];
    const [e1, e2] = materializarEtapas(etapas, "2026-07-01");
    expect(e1?.prazo).toBe("2026-07-06");
    expect(e1?.anexoObrigatorio).toBe(true);
    expect(e2?.prazo).toBeNull();
    expect(e2?.avisarCliente).toBe(true);
  });
});

describe("progressoProcesso", () => {
  it("conta concluídas, pct e próximo prazo", () => {
    const p = progressoProcesso([
      { status: "concluido", prazo: "2026-07-05" },
      { status: "pendente", prazo: "2026-07-20" },
      { status: "pendente", prazo: "2026-07-10" },
    ]);
    expect(p.total).toBe(3);
    expect(p.concluidas).toBe(1);
    expect(p.pct).toBe(33);
    expect(p.concluido).toBe(false);
    expect(p.proximoPrazo).toBe("2026-07-10");
  });
});

describe("tipoComprovante", () => {
  it("reconhece PDF, PNG e JPG; rejeita o resto", () => {
    expect(tipoComprovante(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("pdf");
    expect(tipoComprovante(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("png");
    expect(tipoComprovante(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(tipoComprovante(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("podeGerenciarLegalizacao", () => {
  it("admin/assistente/contador sim; financeiro não", () => {
    expect(podeGerenciarLegalizacao("admin")).toBe(true);
    expect(podeGerenciarLegalizacao("contador")).toBe(true);
    expect(podeGerenciarLegalizacao("financeiro")).toBe(false);
  });
});
