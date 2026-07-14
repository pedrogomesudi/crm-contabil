export type Periodicidade = "semanal" | "mensal" | "trimestral" | "anual";

export const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[] = [
  { valor: "semanal", rotulo: "Semanal" },
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "trimestral", rotulo: "Trimestral" },
  { valor: "anual", rotulo: "Anual" },
];

export type RegraRecorrencia = {
  periodicidade: Periodicidade;
  diaSemana?: number | null;
  diaMes?: number | null;
  mes?: number | null;
};

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MS_DIA = 86_400_000;

// Toda a aritmética é em UTC: `new Date("2026-07-14")` interpretado no fuso local
// cairia no dia 13 em America/Sao_Paulo (UTC-3).
function partes(iso: string): { ano: number; mes: number; dia: number } {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { ano: a ?? 1970, mes: m ?? 1, dia: d ?? 1 };
}

function paraIso(ano: number, mes: number, dia: number): string {
  const mm = String(mes).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Avança `meses` a partir de (ano, mes), fixando o dia-alvo e CLAMPANDO ao último
// dia do mês. Sem o clamp, uma tarefa "todo dia 31" sumiria em fevereiro.
function avancarMeses(iso: string, meses: number, diaAlvo: number): string {
  const p = partes(iso);
  const total = p.ano * 12 + (p.mes - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(diaAlvo, ultimoDiaDoMes(ano, mes));
  return paraIso(ano, mes, dia);
}

export function proximaData(atualIso: string, r: RegraRecorrencia): string {
  if (r.periodicidade === "semanal") {
    const p = partes(atualIso);
    const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia) + 7 * MS_DIA);
    return paraIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const diaAlvo = r.diaMes ?? partes(atualIso).dia;
  if (r.periodicidade === "mensal") return avancarMeses(atualIso, 1, diaAlvo);
  if (r.periodicidade === "trimestral") return avancarMeses(atualIso, 3, diaAlvo);
  return avancarMeses(atualIso, 12, diaAlvo); // anual
}

// A ocorrência nasce quando entra na janela de antecedência — e também quando já
// passou (o cron pode ter falhado ontem; o atrasado não pode ser perdido).
export function deveGerar(proximaIso: string, antecedenciaDias: number, hojeIso: string): boolean {
  const p = partes(proximaIso);
  const alvo = Date.UTC(p.ano, p.mes - 1, p.dia) - antecedenciaDias * MS_DIA;
  const h = partes(hojeIso);
  return Date.UTC(h.ano, h.mes - 1, h.dia) >= alvo;
}

export function rotuloRegra(r: RegraRecorrencia): string {
  if (r.periodicidade === "semanal") return `Toda ${DIAS_SEMANA[r.diaSemana ?? 0]}`;
  if (r.periodicidade === "mensal") return `Todo dia ${r.diaMes ?? "—"}`;
  if (r.periodicidade === "trimestral") return `A cada 3 meses, no dia ${r.diaMes ?? "—"}`;
  const dd = String(r.diaMes ?? 1).padStart(2, "0");
  const mm = String(r.mes ?? 1).padStart(2, "0");
  return `Todo ano em ${dd}/${mm}`;
}
