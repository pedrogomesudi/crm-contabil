import { describe, it, expect } from "vitest";
import { dentroDaRetencao, vereditoRetencao } from "@/lib/lgpd/retencao";
import { CAMPOS_CLIENTE_ANONIMIZAVEIS, anonimizarValor, MARCADOR } from "@/lib/lgpd/anonimizacao";

describe("dentroDaRetencao", () => {
  it("cliente SEM data de saída está em atividade → retém", () => {
    expect(dentroDaRetencao(null, 60, "2026-07-15")).toBe(true);
  });
  it("saiu há menos que o prazo → retém", () => {
    expect(dentroDaRetencao("2024-01-01", 60, "2026-07-15")).toBe(true);
  });
  it("saiu há mais que o prazo → não retém por tempo", () => {
    expect(dentroDaRetencao("2019-01-01", 60, "2026-07-15")).toBe(false);
  });
  it("exatamente no limite do mês ainda retém", () => {
    expect(dentroDaRetencao("2021-07-15", 60, "2026-07-15")).toBe(true);
  });
  it("um dia depois do limite não retém mais", () => {
    expect(dentroDaRetencao("2021-07-14", 60, "2026-07-15")).toBe(false);
  });
});

describe("vereditoRetencao", () => {
  const nada = { temNfse: false, temTitulo: false, temDocumento: false, temObrigacao: false };
  it("tem título → retém o esqueleto fiscal, mesmo fora do prazo por tempo", () => {
    const v = vereditoRetencao({ ...nada, temTitulo: true }, "2019-01-01", 60, "2026-07-15");
    expect(v.reter).toBe(true);
  });
  it("tem NFS-e → retém", () => {
    expect(vereditoRetencao({ ...nada, temNfse: true }, "2019-01-01", 60, "2026-07-15").reter).toBe(true);
  });
  it("nada fiscal e fora do prazo → libera a anonimização total", () => {
    expect(vereditoRetencao(nada, "2019-01-01", 60, "2026-07-15").reter).toBe(false);
  });
  it("cliente ativo (sem saída) → retém, ainda há relação", () => {
    expect(vereditoRetencao(nada, null, 60, "2026-07-15").reter).toBe(true);
  });
});

describe("campos anonimizáveis", () => {
  it("inclui os pessoais e NUNCA os fiscais/PJ", () => {
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).toContain("email");
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).toContain("telefone");
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).toContain("responsavel_nome");
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).not.toContain("razao_social");
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).not.toContain("cpf_cnpj");
    expect(CAMPOS_CLIENTE_ANONIMIZAVEIS).not.toContain("inscricao_estadual");
  });

  it("representante (jsonb) vira null; texto vira o marcador", () => {
    expect(anonimizarValor("representante")).toBeNull();
    expect(anonimizarValor("email")).toBe(MARCADOR);
    expect(anonimizarValor("telefone")).toBe(MARCADOR);
  });
});
