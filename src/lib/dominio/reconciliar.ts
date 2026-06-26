import type { ClienteNormalizado } from "./mapear";

export type ClienteExistente = {
  cpf_cnpj: string;
  razao_social: string;
  regime_tributario: string | null;
  status: string;
  email: string | null;
  telefone: string | null;
};
export type ClasseReconc = "novo" | "atualizado" | "inalterado" | "pendencia";
export type ItemReconc = {
  classe: ClasseReconc;
  cliente: ClienteNormalizado;
  diff: Record<string, [unknown, unknown]>;
};

const CAMPOS: (keyof ClienteExistente & keyof ClienteNormalizado)[] = [
  "razao_social",
  "regime_tributario",
  "status",
  "email",
  "telefone",
];

export function reconciliarClientes(
  novos: ClienteNormalizado[],
  existentes: ClienteExistente[],
): ItemReconc[] {
  const idx = new Map<string, ClienteExistente>();
  for (const e of existentes) idx.set(e.cpf_cnpj, e);

  return novos.map((cliente) => {
    if (cliente.pendencias.length > 0) return { classe: "pendencia" as const, cliente, diff: {} };
    const atual = idx.get(cliente.cpf_cnpj);
    if (!atual) return { classe: "novo" as const, cliente, diff: {} };
    const diff: Record<string, [unknown, unknown]> = {};
    for (const campo of CAMPOS) {
      const antigo = atual[campo] ?? null;
      const novo = cliente[campo] ?? null;
      if (String(antigo) !== String(novo)) diff[campo] = [antigo, novo];
    }
    return {
      classe: Object.keys(diff).length ? ("atualizado" as const) : ("inalterado" as const),
      cliente,
      diff,
    };
  });
}
