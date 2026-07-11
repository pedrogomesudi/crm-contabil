import { somarDias } from "@/lib/onboarding/processo";
import { etapaConcluida, type LegOrgao, type LegEtapaStatus } from "@/lib/legalizacao/tipos";

export type EtapaTemplate = { ordem: number; titulo: string; descricao: string | null; orgao: LegOrgao; prazoDias: number | null; responsavelPapel: string | null; anexoObrigatorio: boolean; avisarCliente: boolean };
export type EtapaSeed = EtapaTemplate & { prazo: string | null };

export function materializarEtapas(etapas: EtapaTemplate[], dataInicio: string): EtapaSeed[] {
  return etapas
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ ...e, prazo: e.prazoDias == null ? null : somarDias(dataInicio, e.prazoDias) }));
}

export function progressoProcesso(etapas: { status: LegEtapaStatus; prazo: string | null }[]): { total: number; concluidas: number; pct: number; concluido: boolean; proximoPrazo: string | null } {
  const total = etapas.length;
  const concluidas = etapas.filter((e) => etapaConcluida(e.status)).length;
  const pct = total === 0 ? 0 : Math.round((concluidas / total) * 100);
  const prazos = etapas.filter((e) => !etapaConcluida(e.status) && e.prazo).map((e) => e.prazo as string).sort();
  return { total, concluidas, pct, concluido: total > 0 && concluidas === total, proximoPrazo: prazos[0] ?? null };
}

// Comprovante aceita PDF, PNG e JPG (magic bytes; extensão é forjável).
export function tipoComprovante(buf: Uint8Array): "pdf" | "png" | "jpg" | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}
