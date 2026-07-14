export type Departamento = "contabil" | "fiscal" | "pessoal" | "societario";

export const DEPARTAMENTOS: { valor: Departamento; rotulo: string }[] = [
  { valor: "contabil", rotulo: "Contábil" },
  { valor: "fiscal", rotulo: "Fiscal" },
  { valor: "pessoal", rotulo: "Pessoal (Folha)" },
  { valor: "societario", rotulo: "Societário/Legalização" },
];

export function rotuloDepartamento(d: Departamento): string {
  return DEPARTAMENTOS.find((x) => x.valor === d)?.rotulo ?? d;
}
