import { describe, it, expect } from "vitest";
import { parseTemplatesMeta } from "@/lib/whatsapp/templates-meta";

describe("parseTemplatesMeta", () => {
  it("mapeia os status da Meta", () => {
    const json = {
      data: [
        { name: "cobranca", language: "pt_BR", status: "APPROVED" },
        { name: "aviso", language: "pt_BR", status: "PENDING" },
        { name: "velho", language: "pt_BR", status: "REJECTED" },
        { name: "raro", language: "en_US", status: "PAUSED" },
      ],
    };
    expect(parseTemplatesMeta(json)).toEqual([
      { nome: "cobranca", idioma: "pt_BR", status: "aprovado" },
      { nome: "aviso", idioma: "pt_BR", status: "pendente" },
      { nome: "velho", idioma: "pt_BR", status: "reprovado" },
      { nome: "raro", idioma: "en_US", status: "outro" },
    ]);
  });
  it("payload vazio ou torto → lista vazia", () => {
    expect(parseTemplatesMeta({})).toEqual([]);
    expect(parseTemplatesMeta(null)).toEqual([]);
    expect(parseTemplatesMeta({ data: "x" })).toEqual([]);
  });
  it("ignora entradas sem nome", () => {
    expect(parseTemplatesMeta({ data: [{ language: "pt_BR", status: "APPROVED" }] })).toEqual([]);
  });
});
