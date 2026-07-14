export type Celula = { data: string; doMes: boolean };

export const DIAS_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const MS_DIA = 86_400_000;

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

// Grade mensal de domingo a sábado, sempre múltipla de 7 (as semanas não ficam quebradas).
// Toda a aritmética em UTC: data local cairia no dia anterior em America/Sao_Paulo.
export function gradeDoMes(ano: number, mes: number): Celula[] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const inicio = new Date(primeiro.getTime() - primeiro.getUTCDay() * MS_DIA);
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  const fim = new Date(ultimo.getTime() + (6 - ultimo.getUTCDay()) * MS_DIA);

  const celulas: Celula[] = [];
  for (let t = inicio.getTime(); t <= fim.getTime(); t += MS_DIA) {
    const d = new Date(t);
    celulas.push({ data: iso(d), doMes: d.getUTCMonth() === mes - 1 });
  }
  return celulas;
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

export const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
