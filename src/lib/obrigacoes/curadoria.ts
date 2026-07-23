import type { ObrigacaoSeed } from "./seed";

// Curadoria da matriz: a matriz é de onde sai o calendário de todo cliente, e até aqui não
// havia como saber se uma regra ainda valia. Estas funções são puras — decidem o que está
// velho e o que divergiu do padrão do sistema, sem tocar em banco.

export type EstadoRevisao = "nunca" | "em_dia" | "vencida";

// 12 meses: o ciclo fiscal é anual. Fixo no código, não configurável — a validade de uma
// conferência não é preferência de escritório.
export const MESES_VALIDADE_REVISAO = 12;

// Derivado, nunca guardado: um campo "está vencida" viraria uma segunda verdade que
// envelhece sozinha no banco.
export function estadoRevisao(revisadaEm: string | null, hoje: string): EstadoRevisao {
  if (!revisadaEm) return "nunca";
  const r = Date.parse(`${revisadaEm.slice(0, 10)}T00:00:00Z`);
  const h = Date.parse(`${hoje.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(r) || Number.isNaN(h)) return "nunca";
  const limite = new Date(r);
  limite.setUTCMonth(limite.getUTCMonth() + MESES_VALIDADE_REVISAO);
  // No dia exato em que completa 12 meses a revisão vence — o benefício da dúvida acaba ali.
  return h >= limite.getTime() ? "vencida" : "em_dia";
}

// O que a lei determina. Divergir aqui é erro de um dos lados e merece ser mostrado.
export const CAMPOS_NORMATIVOS = [
  "esfera",
  "periodicidade",
  "aplicavelA",
  "condicaoFlags",
  "condicaoModo",
  "ufs",
  "cnaePrefixos",
  "vencDia",
  "vencMesOffset",
  "vencMes",
  "vencAnoOffset",
  "antecipa",
  "baseLegal",
] as const;

export type CampoNormativo = (typeof CAMPOS_NORMATIVOS)[number];

// `ativa`, `ordem` e `prazoInternoDiasUteis` ficam DE FORA: são preferências do escritório
// (desligar uma obrigação que não atende, folga interna antes do prazo legal). Divergir
// nesses campos é o sistema funcionando, não um erro a corrigir.
export type LinhaComparavel = Pick<ObrigacaoSeed, "codigo"> &
  Partial<Record<CampoNormativo, unknown>> & { id?: string };

export type Divergencia = { codigo: string; campo: CampoNormativo; noBanco: unknown; noPadrao: unknown };

export type ResultadoDiff = {
  // No padrão do sistema e ausentes no banco: é o que `semearMatrizPadrao` já resolve.
  ausentes: string[];
  divergentes: Divergencia[];
};

const iguais = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    // Ordem de UF ou de flag não é informação — ["SP","RJ"] e ["RJ","SP"] são a mesma regra.
    if (a.length !== b.length) return false;
    const x = [...a].map(String).sort();
    const y = [...b].map(String).sort();
    return x.every((v, i) => v === y[i]);
  }
  // null e undefined descrevem o mesmo estado aqui ("sem valor"), e o banco devolve null
  // onde a seed usa undefined em campo opcional.
  if (a == null && b == null) return true;
  return a === b;
};

export function diffMatriz(banco: LinhaComparavel[], padrao: ObrigacaoSeed[]): ResultadoDiff {
  const porCodigo = new Map(banco.map((l) => [l.codigo, l]));
  const ausentes: string[] = [];
  const divergentes: Divergencia[] = [];

  for (const p of padrao) {
    const atual = porCodigo.get(p.codigo);
    if (!atual) {
      ausentes.push(p.codigo);
      continue;
    }
    for (const campo of CAMPOS_NORMATIVOS) {
      const noPadrao = (p as Record<string, unknown>)[campo];
      // Campo que o padrão não define não vira divergência — não há o que comparar.
      if (noPadrao === undefined) continue;
      const noBanco = (atual as Record<string, unknown>)[campo];
      if (!iguais(noBanco, noPadrao)) divergentes.push({ codigo: p.codigo, campo, noBanco, noPadrao });
    }
  }
  // Obrigação que só existe no banco NÃO é divergência: é obrigação criada pelo escritório
  // (ISS municipal, GIA estadual), e o padrão do sistema não tem opinião sobre ela.
  return { ausentes, divergentes };
}
