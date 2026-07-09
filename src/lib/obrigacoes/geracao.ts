import type { PerfilCliente } from "@/lib/onboarding/processo";
import { calcularVencimento, type RegraPrazo } from "./prazo";

export type ObrigacaoMatriz = { id: string; periodicidade: "mensal" | "trimestral" | "anual"; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; ufs: string[]; cnaePrefixos: string[]; regra: RegraPrazo };
export type ClienteFiscal = { perfil: PerfilCliente; uf: string | null; cnae: string | null; flags: Record<string, boolean> };
export type InstanciaSeed = { obrigacaoId: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string };

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function obrigacaoAplica(o: ObrigacaoMatriz, c: ClienteFiscal): boolean {
  if (!o.aplicavelA.includes("*") && !o.aplicavelA.includes(c.perfil)) return false;
  if (o.condicaoFlags.length > 0) {
    const ok = o.condicaoModo === "any" ? o.condicaoFlags.some((f) => c.flags[f] === true) : o.condicaoFlags.every((f) => c.flags[f] === true);
    if (!ok) return false;
  }
  if (o.ufs.length > 0 && (!c.uf || !o.ufs.includes(c.uf))) return false;
  if (o.cnaePrefixos.length > 0) {
    const cnae = soDigitos(c.cnae ?? "");
    if (!o.cnaePrefixos.some((p) => cnae.startsWith(soDigitos(p)))) return false;
  }
  return true;
}

export function instanciasDaCompetencia(obrigacoes: ObrigacaoMatriz[], c: ClienteFiscal, ano: number, mes: number): InstanciaSeed[] {
  const out: InstanciaSeed[] = [];
  for (const o of obrigacoes) {
    if (!obrigacaoAplica(o, c)) continue;
    let competencia: string | null = null;
    if (o.periodicidade === "mensal") competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
    else if (o.periodicidade === "trimestral") {
      if ([3, 6, 9, 12].includes(mes)) competencia = `${ano}-${String(mes - 2).padStart(2, "0")}-01`;
    } else if (mes === 1) competencia = `${ano - 1}-01-01`;
    if (!competencia) continue;
    const v = calcularVencimento(o.regra, competencia);
    out.push({ obrigacaoId: o.id, competencia, vencimentoLegal: v.legal, vencimentoInterno: v.interno });
  }
  return out;
}
