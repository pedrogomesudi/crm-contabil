export type VarianteStat = "neutro" | "positivo" | "destaque" | "negativo";

export function corValorStat(v: VarianteStat): string {
  return { neutro: "text-texto", positivo: "text-verde", destaque: "text-violeta", negativo: "text-negativo" }[v];
}
