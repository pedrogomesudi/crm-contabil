import { describe, it, expect } from "vitest";
import { normalizarMarca, tipoImagem } from "@/lib/escritorio/marca";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("normalizarMarca", () => {
  it("aceita dados válidos e monta o endereço", () => {
    const r = normalizarMarca(
      fd({
        nome: "Escritório X",
        cnpj: "11.222.333/0001-81",
        email: "a@b.com",
        telefone: "34999",
        cidade: "Uberlândia",
        uf: "MG",
      }),
    );
    expect(r).toEqual({
      nome: "Escritório X",
      cnpj: "11222333000181",
      email: "a@b.com",
      telefone: "34999",
      endereco: { cidade: "Uberlândia", uf: "MG" },
    });
  });
  it("rejeita CNPJ inválido", () => {
    expect(normalizarMarca(fd({ cnpj: "11.111.111/1111-11" }))).toHaveProperty("erro");
  });
  it("rejeita e-mail malformado", () => {
    expect(normalizarMarca(fd({ email: "sem-arroba" }))).toHaveProperty("erro");
  });
  it("campos vazios viram null e endereço vazio vira null", () => {
    expect(normalizarMarca(fd({}))).toEqual({
      nome: null,
      cnpj: null,
      email: null,
      telefone: null,
      endereco: null,
    });
  });
});

describe("tipoImagem", () => {
  it("reconhece PNG pelos magic bytes", () => {
    expect(tipoImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  });
  it("reconhece JPG pelos magic bytes", () => {
    expect(tipoImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
  });
  it("rejeita SVG (texto) mesmo com extensão de imagem", () => {
    const svg = new TextEncoder().encode("<svg xmlns=...");
    expect(tipoImagem(svg)).toBeNull();
  });
  it("rejeita conteúdo aleatório", () => {
    expect(tipoImagem(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
