export type ItemRecorrencia = "mensal" | "unico";

export function totaisProposta(itens: { valor: number; recorrencia: ItemRecorrencia }[]): {
  mensal: number;
  unico: number;
} {
  let mensal = 0,
    unico = 0;
  for (const i of itens) {
    if (i.recorrencia === "mensal") mensal += i.valor;
    else unico += i.valor;
  }
  return { mensal, unico };
}
