import { describe, it, expect } from "vitest";
import { clienteSchema } from "@/lib/validation/cliente";

const base = {
  tipo_pessoa: "PJ",
  razao_social: "Empresa X",
  cpf_cnpj: "11222333000181",
  regime_tributario: "Simples",
};

describe("clienteSchema canal_cobranca", () => {
  it("aceita as 3 opções", () => {
    for (const c of ["whatsapp", "email", "ambos"]) {
      const r = clienteSchema.safeParse({ ...base, canal_cobranca: c });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.canal_cobranca).toBe(c);
    }
  });
  it("ausente aplica default 'ambos'", () => {
    const r = clienteSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.canal_cobranca).toBe("ambos");
  });
  it("rejeita valor inválido", () => {
    const r = clienteSchema.safeParse({ ...base, canal_cobranca: "sms" });
    expect(r.success).toBe(false);
  });
});
