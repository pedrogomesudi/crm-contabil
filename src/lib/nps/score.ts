export type ResumoNps = {
  total: number;
  promotores: number; // nota 9-10
  neutros: number; // nota 7-8
  detratores: number; // nota 0-6
  score: number; // %promotores - %detratores, arredondado (-100..100); 0 quando total=0
};

export function resumirNps(notas: number[]): ResumoNps {
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  for (const n of notas) {
    if (n >= 9) promotores++;
    else if (n >= 7) neutros++;
    else detratores++;
  }
  const total = notas.length;
  const score = total > 0 ? Math.round((promotores / total) * 100) - Math.round((detratores / total) * 100) : 0;
  return { total, promotores, neutros, detratores, score };
}
