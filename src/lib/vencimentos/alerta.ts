// Motor de alerta de vencimentos. Puro e determinístico: recebe "hoje" como argumento
// (o relógio vive em hoje.ts) para ser testável e para não violar react-hooks/purity.

export type Severidade = "vencido" | "critico" | "alerta" | "aviso" | "ok";
export type OrigemVencimento = "certificado" | "procuracao" | "nfse";

export type ItemVencimento = {
  id: string;
  origem: OrigemVencimento;
  clienteId: string | null; // null = certificado do escritório
  clienteNome: string;
  titulo: string;
  detalhe: string;
  validade: string; // YYYY-MM-DD
  severidade: Severidade;
  diasRestantes: number;
  editavel: boolean; // false nas linhas vindas da NFS-e
};

export type ResumoVencimentos = { vencidos: number; criticos: number; alertas: number; avisos: number };

// Marcos 60/30/15. Data inválida cai em "ok" (não vira linha fantasma no painel).
export function classificarVencimento(
  validade: string,
  hoje: string,
): { severidade: Severidade; diasRestantes: number } {
  const v = Date.parse(`${validade}T00:00:00Z`);
  const h = Date.parse(`${hoje}T00:00:00Z`);
  if (Number.isNaN(v) || Number.isNaN(h)) return { severidade: "ok", diasRestantes: 0 };
  const dias = Math.round((v - h) / 86_400_000);
  if (dias < 0) return { severidade: "vencido", diasRestantes: dias };
  if (dias <= 15) return { severidade: "critico", diasRestantes: dias };
  if (dias <= 30) return { severidade: "alerta", diasRestantes: dias };
  if (dias <= 60) return { severidade: "aviso", diasRestantes: dias };
  return { severidade: "ok", diasRestantes: dias };
}

const ORDEM: Record<Severidade, number> = { vencido: 0, critico: 1, alerta: 2, aviso: 3, ok: 4 };
export function ordemSeveridade(s: Severidade): number {
  return ORDEM[s];
}

// Descarta os "ok", ordena (mais grave primeiro; empate = validade mais próxima) e conta.
export function montarPainel(itens: ItemVencimento[]): {
  resumo: ResumoVencimentos;
  itens: ItemVencimento[];
} {
  const relevantes = itens.filter((i) => i.severidade !== "ok");
  const resumo: ResumoVencimentos = { vencidos: 0, criticos: 0, alertas: 0, avisos: 0 };
  for (const i of relevantes) {
    if (i.severidade === "vencido") resumo.vencidos++;
    else if (i.severidade === "critico") resumo.criticos++;
    else if (i.severidade === "alerta") resumo.alertas++;
    else if (i.severidade === "aviso") resumo.avisos++;
  }
  relevantes.sort(
    (a, b) => ordemSeveridade(a.severidade) - ordemSeveridade(b.severidade) || a.validade.localeCompare(b.validade),
  );
  return { resumo, itens: relevantes };
}
