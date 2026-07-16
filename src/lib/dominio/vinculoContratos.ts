import type { ContratoDominio } from "./tipos";

// Chave de comparação de razão social: maiúsculas, sem acentos, sem pontuação,
// sem números (o Domínio às vezes prefixa o CNPJ no nome) e sem sufixos
// societários. Ex.: "50.565.165 RENATO DELA TORRE E SILVA" e
// "Renato Dela Torre e Silva LTDA" convergem para "RENATO DELA TORRE E SILVA".
const SUFIXOS = /\b(LTDA|ME|EPP|EIRELI|SA|S A)\b/g;

export function normalizarRazao(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^A-Z0-9 ]/g, " ") // pontuação -> espaço
    .replace(/\b\d[\d ]*\b/g, " ") // remove tokens numéricos (CNPJ embutido)
    .replace(SUFIXOS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Empresa = { cpfCnpj: string; razaoSocial: string };
export type VinculoContratos = {
  porCnpj: Map<string, ContratoDominio[]>;
  naoCasados: string[];
  ambiguos: string[];
};

// Liga cada contrato ao cliente pela razão social (normalizada), resolvendo o
// CNPJ a partir da lista de empresas. O elo final é o CNPJ (exato e seguro);
// só o passo contrato->empresa é por nome. Homônimos (mesma chave, CNPJs
// diferentes) NÃO são vinculados — melhor deixar manual do que errar o cliente.
export function vincularContratosPorNome(contratos: ContratoDominio[], empresas: Empresa[]): VinculoContratos {
  // chave -> cnpj; valor null marca chave ambígua (>1 CNPJ com o mesmo nome).
  const chaveParaCnpj = new Map<string, string | null>();
  for (const e of empresas) {
    const k = normalizarRazao(e.razaoSocial);
    if (!k || !e.cpfCnpj) continue;
    if (chaveParaCnpj.has(k)) {
      const atual = chaveParaCnpj.get(k);
      if (atual && atual !== e.cpfCnpj) chaveParaCnpj.set(k, null);
    } else {
      chaveParaCnpj.set(k, e.cpfCnpj);
    }
  }

  const porCnpj = new Map<string, ContratoDominio[]>();
  const naoCasados: string[] = [];
  const ambiguosSet = new Set<string>();
  for (const c of contratos) {
    const k = normalizarRazao(c.clienteNome);
    const cnpj = k ? chaveParaCnpj.get(k) : undefined;
    if (cnpj === undefined) {
      naoCasados.push(c.clienteNome);
      continue;
    }
    if (cnpj === null) {
      ambiguosSet.add(c.clienteNome);
      continue;
    }
    const lista = porCnpj.get(cnpj) ?? [];
    lista.push(c);
    porCnpj.set(cnpj, lista);
  }
  return { porCnpj, naoCasados, ambiguos: [...ambiguosSet] };
}
