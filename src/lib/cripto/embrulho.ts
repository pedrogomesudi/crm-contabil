import { cifrar, decifrar } from "@/lib/nfse/cripto";

// Primitivas PURAS (sem banco, sem server-only) — testáveis. Embrulhar/desembrulhar a DEK
// usam o mesmo AES-256-GCM do dado: a DEK (hex de 32 bytes) é o "dado" cifrado pela mestra.
export function embrulhar(dekHex: string, masterHex: string): string {
  return cifrar(Buffer.from(dekHex, "hex"), masterHex);
}

export function desembrulhar(dekCifrado: string, masterHex: string): string {
  return decifrar(dekCifrado, masterHex).toString("hex");
}
