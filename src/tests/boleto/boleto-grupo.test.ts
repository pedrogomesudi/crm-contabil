import { describe, it, expect } from "vitest";
import { montarDadosBoletoGrupo } from "@/app/(app)/financeiro/contas-a-receber/boleto-grupo";
import type { MembroGrupo } from "@/lib/financeiro/grupo-cobranca";

const titular = {
  clienteId: "1",
  razaoSocial: "MATRIZ LTDA",
  cpfCnpj: "12.345.678/0001-90",
  email: "m@x.com",
  endereco: { cep: "38400000", logradouro: "RUA A", numero: "1", bairro: "B", cidade: "UBERLANDIA", uf: "MG" },
};
const membros: MembroGrupo[] = [
  { clienteId: "1", razaoSocial: "MATRIZ LTDA", cpfCnpj: "12345678000190", honorario: 200 },
  { clienteId: "2", razaoSocial: "FILIAL LTDA", cpfCnpj: "12345678000271", honorario: 150 },
];

describe("montarDadosBoletoGrupo", () => {
  const d = montarDadosBoletoGrupo(titular, membros, "Grupo X", 42, "2026-09-10", "2026-08-01");
  it("pagador = titular, documento só dígitos", () => {
    expect(d.pagadorNome).toBe("MATRIZ LTDA");
    expect(d.pagadorDocumento).toBe("12345678000190");
  });
  it("valor = soma dos honorários", () => {
    expect(d.valor).toBe(350);
  });
  it("titular fora do grupo de faturamento não entra na lista", () => {
    const soFilial: MembroGrupo[] = [
      { clienteId: "2", razaoSocial: "FILIAL LTDA", cpfCnpj: "12345678000271", honorario: 150 },
    ];
    const r = montarDadosBoletoGrupo(titular, soFilial, "Grupo X", 1, "2026-09-10", "2026-08-01");
    expect(r.observacoes).toEqual(["Competência 08/2026", "FILIAL"]);
  });
  it("titular membro abre a lista com a razão social inteira, sem abreviar", () => {
    expect(d.observacoes).toEqual(["Competência 08/2026", "MATRIZ LTDA, FILIAL"]);
  });
  it("titular membro aparece uma vez só", () => {
    expect(d.observacoes!.join(", ").match(/MATRIZ/g)).toHaveLength(1);
  });
  it("as 14 empresas do maior grupo real cabem nas 5 linhas do Inter", () => {
    const reais = [
      "ADCEGRO ADMINISTRACAO E AGRONEGOCIOS LTD",
      "SOLUCAO GESTAO DE PARTICIPACOES LTDA",
      "JANDI GESTAO DE PARTICIPACOES LTDA",
      "ROPAKE GESTÃO DE PARTICIPAÇÕES LTDA",
      "TEODORO LAU PARTICIPAÇES E EMPREENDIMENTOS IMOBILIARIOS",
      "CONSTROI PARTICIPACOES LTDA",
      "ATOS GESTAO E PARTICIPACOES LTDA",
      "CONSTROI INCORPORADORA E LOTEADORA LTDA",
      "DIRETRIZ GESTAO DE NEGOCIOS LTDA",
      "FAMILY GESTAO DE PARTICIPACOES LTDA.",
      "GPLA GESTÃO DE PARTICIPAÇÕES LTDA",
      "MASTER INCORPORADORA E LOTEADORA LTDA",
      "VEGAS GESTAO E PARTICIPACOES LTDA",
      "WISDOM GESTAO DE PARTICIPACOES EIRELI",
    ];
    const membros14: MembroGrupo[] = reais.map((razaoSocial, i) => ({
      clienteId: String(i),
      razaoSocial,
      cpfCnpj: "12345678000190",
      honorario: 100,
    }));
    const obs = montarDadosBoletoGrupo(titular, membros14, "CONSTROI", 1, "2026-09-10", "2026-08-01").observacoes!;
    expect(obs.length).toBeLessThanOrEqual(5);
    for (const l of obs) expect(l.length).toBeLessThanOrEqual(78);
    // Nenhuma empresa fica de fora, e as duas "CONSTROI" seguem distinguíveis.
    expect(obs.join(" ")).not.toContain("e mais");
    expect(obs.join(", ")).toContain("CONSTROI PARTICIPACOES");
    expect(obs.join(", ")).toContain("CONSTROI INCORPORADORA");
  });
  it("seuNumero e vencimento corretos", () => {
    expect(d.seuNumero).toBe("42");
    expect(d.vencimento).toBe("2026-09-10");
  });
  it("endereço do pagador preenchido (CEP só dígitos)", () => {
    expect(d.pagadorEndereco?.cidade).toBe("UBERLANDIA");
    expect(d.pagadorEndereco?.cep).toBe("38400000");
  });
});
