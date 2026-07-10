// Só I/O: busca séries do SGS/BACEN. Trocável (é a única peça acoplada à API). Sem cálculo aqui.
import type { PontoSerie } from "./indice";

export const SERIE_SGS = { SALARIO_MINIMO: 1619, IPCA: 433, IGPM: 189, INPC: 188 } as const;

const UA = "crm-contabil/1.0 (+integracao-bacen)";

export async function buscarSerie(
  codigo: number,
  dataInicial: string, // DD/MM/AAAA
  dataFinal: string,
): Promise<PontoSerie[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": UA } });
    if (!res.ok) throw new Error(`BACEN respondeu HTTP ${res.status}`);
    return (await res.json()) as PontoSerie[];
  } finally {
    clearTimeout(timer);
  }
}
