import { describe, it, expect } from "vitest";
import {
  montarMapaTags, tagsNoTexto, formatarMesAno, formatarEnderecoLinha, formatarBRL, type DadosTags,
} from "@/lib/comercial/proposta-template";

const base: DadosTags = {
  proposta: { numero: 123, validade: "2026-08-31", observacoes: "Faturamento mensal." },
  cliente: { nome: "Padaria X", contato: "João" },
  itens: [
    { descricao: "Contábil", valor: 1000, recorrencia: "mensal" },
    { descricao: "Abertura", valor: 500, recorrencia: "unico" },
  ],
  marca: { nome: "Elevare", cnpj: "11222333000181", email: "c@e.com", telefone: "3433001774", endereco: { cidade: "Uberlândia", uf: "MG" } },
  responsavel: { nome: "Pedro", email: "p@e.com", telefone: "34999" },
  hoje: "2026-07-11",
};

describe("montarMapaTags", () => {
  it("mapeia todos os grupos", () => {
    const { mapa } = montarMapaTags(base);
    expect(mapa.nome_cliente).toBe("Padaria X");
    expect(mapa.contato_cliente).toBe("João");
    expect(mapa.numero_proposta).toBe("123");
    expect(mapa.mes_ano).toBe("Julho/2026");
    expect(mapa.data_emissao).toBe("11/07/2026");
    expect(mapa.validade).toBe("31/08/2026");
    expect(mapa.condicoes).toBe("Faturamento mensal.");
    expect(mapa.nome_escritorio).toBe("Elevare");
    expect(mapa.cnpj_escritorio).toBe("11.222.333/0001-81");
    expect(mapa.endereco_escritorio).toBe("Uberlândia/MG");
    expect(mapa.responsavel_nome).toBe("Pedro");
    expect(mapa.total_mensal).toBe("R$ 1.000,00");
    expect(mapa.total_unico).toBe("R$ 500,00");
  });
  it("nulos viram string vazia", () => {
    const { mapa } = montarMapaTags({
      ...base,
      proposta: { numero: 1, validade: null, observacoes: null },
      cliente: { nome: "Y", contato: null },
      marca: { nome: null, cnpj: null, email: null, telefone: null, endereco: null },
      responsavel: { nome: null, email: null, telefone: null },
    });
    expect(mapa.validade).toBe("");
    expect(mapa.condicoes).toBe("");
    expect(mapa.cnpj_escritorio).toBe("");
    expect(mapa.endereco_escritorio).toBe("");
    expect(mapa.responsavel_nome).toBe("");
  });
  it("devolve itens formatados para o loop", () => {
    const { itens } = montarMapaTags(base);
    expect(itens).toEqual([
      { descricao: "Contábil", recorrencia: "Mensal", valor: "R$ 1.000,00" },
      { descricao: "Abertura", recorrencia: "Único", valor: "R$ 500,00" },
    ]);
  });
});

describe("tagsNoTexto", () => {
  it("extrai tags e ignora controle de loop", () => {
    const t = tagsNoTexto("Olá {nome_cliente}, {#itens}{descricao}{/itens} {desconhecida}");
    expect(t).toContain("nome_cliente");
    expect(t).toContain("descricao");
    expect(t).toContain("desconhecida");
    expect(t).not.toContain("#itens");
    expect(t).not.toContain("/itens");
  });
});

describe("helpers", () => {
  it("formatarMesAno em pt-BR", () => { expect(formatarMesAno("2026-07-11")).toBe("Julho/2026"); });
  it("formatarEnderecoLinha junta partes", () => {
    expect(formatarEnderecoLinha({ logradouro: "Rua A", numero: "10", cidade: "Uberlândia", uf: "MG" })).toBe("Rua A, 10 · Uberlândia/MG");
  });
  it("formatarEnderecoLinha vazio", () => { expect(formatarEnderecoLinha(null)).toBe(""); });
  it("formatarBRL", () => { expect(formatarBRL(1234.5)).toBe("R$ 1.234,50"); });
});
