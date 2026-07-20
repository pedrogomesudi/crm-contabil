import { describe, it, expect } from "vitest";
import { normalizarExtensaoFinanceira } from "@/lib/financeiro/extensaoCliente";

function fd(pairs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.set(k, v);
  return f;
}

describe("normalizarExtensaoFinanceira — recorrência", () => {
  it("checkbox presente => tem_honorarios_recorrentes true", () => {
    const r = normalizarExtensaoFinanceira(fd({ tem_honorarios_recorrentes: "on" }));
    expect("erro" in r ? null : r.tem_honorarios_recorrentes).toBe(true);
  });
  it("checkbox ausente => tem_honorarios_recorrentes false", () => {
    const r = normalizarExtensaoFinanceira(fd({}));
    expect("erro" in r ? null : r.tem_honorarios_recorrentes).toBe(false);
  });
});
