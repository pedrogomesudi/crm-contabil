const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-based
const diaSemana = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay(); // 0 dom .. 6 sáb
const somaDias = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export type RegraPrazo = { periodicidade: "mensal" | "trimestral" | "anual"; vencDia: number; vencMesOffset: number; vencMes: number | null; vencAnoOffset: number; prazoInternoDiasUteis: number; antecipa: boolean };

export function feriadosNacionais(ano: number): Set<string> {
  const f = new Set<string>();
  for (const [m, d] of [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25]] as const) f.add(iso(ano, m, d));
  // Páscoa (Meeus/Jones/Butcher)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascoa = iso(ano, mes, dia);
  f.add(somaDias(pascoa, -2)); // Sexta-feira Santa
  f.add(somaDias(pascoa, -47)); // Carnaval (terça)
  f.add(somaDias(pascoa, 60)); // Corpus Christi
  return f;
}

export function ehDiaUtil(s: string, feriados: Set<string>): boolean {
  const dw = diaSemana(s);
  return dw !== 0 && dw !== 6 && !feriados.has(s);
}

export function diaUtilAnterior(s: string, feriados: Set<string>): string {
  let cur = s;
  while (!ehDiaUtil(cur, feriados)) cur = somaDias(cur, -1);
  return cur;
}

export function subtraiDiasUteis(s: string, n: number, feriados: Set<string>): string {
  let cur = s;
  let restam = n;
  while (restam > 0) {
    cur = somaDias(cur, -1);
    if (ehDiaUtil(cur, feriados)) restam--;
  }
  return cur;
}

export function calcularVencimento(regra: RegraPrazo, competencia: string): { legal: string; interno: string } {
  const cy = Number(competencia.slice(0, 4));
  const cm = Number(competencia.slice(5, 7));
  let ano: number;
  let mes: number;
  if (regra.periodicidade === "anual") {
    ano = cy + regra.vencAnoOffset;
    mes = regra.vencMes ?? 1;
  } else {
    const mesRef = regra.periodicidade === "trimestral" ? cm + 2 : cm; // mês final do trimestre
    const t = new Date(Date.UTC(cy, mesRef - 1 + regra.vencMesOffset, 1));
    ano = t.getUTCFullYear();
    mes = t.getUTCMonth() + 1;
  }
  const dia = Math.min(regra.vencDia, ultimoDia(ano, mes));
  const feriados = new Set<string>([...feriadosNacionais(ano - 1), ...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)]);
  let legal = iso(ano, mes, dia);
  if (regra.antecipa) legal = diaUtilAnterior(legal, feriados);
  const interno = regra.prazoInternoDiasUteis > 0 ? subtraiDiasUteis(legal, regra.prazoInternoDiasUteis, feriados) : legal;
  return { legal, interno };
}
