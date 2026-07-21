export type GrupoRentab = { grupo: string; minutos: number; custo: number; recebido: number; contratado: number };

type LinhaSeg = {
  minutos: number;
  custo: number;
  recebido: number;
  contratado: number;
  regime?: string | null;
  porte?: string | null;
};

export function agruparRentabilidade(linhas: LinhaSeg[], dimensao: "regime" | "porte"): GrupoRentab[] {
  const mapa = new Map<string, GrupoRentab>();
  for (const l of linhas) {
    const bruto = dimensao === "regime" ? l.regime : l.porte;
    const grupo = bruto && bruto.trim() !== "" ? bruto : "Não classificado";
    const g = mapa.get(grupo) ?? { grupo, minutos: 0, custo: 0, recebido: 0, contratado: 0 };
    g.minutos += l.minutos;
    g.custo += l.custo;
    g.recebido += l.recebido;
    g.contratado += l.contratado;
    mapa.set(grupo, g);
  }
  return [...mapa.values()].sort((a, b) => b.recebido - a.recebido);
}
