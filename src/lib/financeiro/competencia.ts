// O escritório fatura em regime vencido: a competência corrente é sempre o mês anterior.
// Puro (recebe a data) para ser testável; o relógio fica na função de baixo.

// "2026-07-10" -> "2026-06" (formato de <input type="month">)
export function mesAnterior(hojeISO: string): string {
  const partes = hojeISO.slice(0, 7).split("-");
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const total = ano * 12 + (mes - 1) - 1; // meses desde o ano 0, menos um
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}`;
}

// Fora de componente: usar o relógio aqui não dispara react-hooks/purity.
export function mesAnteriorDeHoje(): string {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return mesAnterior(hoje);
}
