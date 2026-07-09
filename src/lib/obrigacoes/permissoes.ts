import type { Papel } from "@/lib/tipos";

// Curadoria da matriz de obrigações é exclusiva do admin.
export function podeGerenciarMatriz(papel: Papel | undefined): boolean {
  return papel === "admin";
}
