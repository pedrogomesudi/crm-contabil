import { describe, it, expect } from "vitest";
import { normalizarConstituicao, validarAtivacao } from "@/lib/clientes/constituicao";
import { rotuloStatusCliente } from "@/lib/ui/apresentacao";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("normalizarConstituicao", () => {
  it("exige razão social", () => {
    expect(normalizarConstituicao(fd({ regime: "Simples" }))).toHaveProperty("erro");
  });
  it("monta dados, sócios e representante = administrador", () => {
    const f = fd({ razao_social: "Nova X Ltda", regime: "Simples", cidade: "Uberlândia", uf: "MG" });
    f.set("socios", JSON.stringify([
      { nome: "Ana", cpf: "11144477735", participacao: "50%", papelSocietario: "administrador" },
      { nome: "Bruno", cpf: null, participacao: "50%", papelSocietario: "quotista" },
    ]));
    const r = normalizarConstituicao(f);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.razaoSocial).toBe("Nova X Ltda");
    expect(r.regime).toBe("Simples");
    expect(r.socios).toHaveLength(2);
    expect(r.representante?.nome).toBe("Ana");
  });
  it("rejeita regime inválido", () => {
    expect(normalizarConstituicao(fd({ razao_social: "X", regime: "Nada" }))).toHaveProperty("erro");
  });
});

describe("validarAtivacao", () => {
  it("rejeita CNPJ inválido", () => { expect(validarAtivacao("11.111.111/1111-11", "Simples").erro).toBeTruthy(); });
  it("aceita CNPJ válido", () => { expect(validarAtivacao("11.222.333/0001-81", "Simples").erro).toBeUndefined(); });
});

describe("rotuloStatusCliente", () => {
  it("rotula em constituição", () => { expect(rotuloStatusCliente("em_constituicao")).toBe("Em constituição"); });
});
