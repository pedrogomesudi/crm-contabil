import type { Papel } from "@/lib/tipos";

// O portal é a única superfície do papel 'cliente'; a equipe nunca entra nele,
// e o cliente nunca entra nas telas da equipe (gates nos layouts dos dois grupos).
export function ehCliente(papel: Papel | undefined): boolean {
  return papel === "cliente";
}

export function ehEquipe(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "contador" || papel === "assistente" || papel === "financeiro";
}
