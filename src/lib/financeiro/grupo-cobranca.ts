import { formatarDocumento } from "@/lib/format";

// Uma empresa membro de um grupo de cobrança, com o honorário que ela contribui ao boleto único.
export type MembroGrupo = {
  clienteId: string;
  razaoSocial: string;
  cpfCnpj: string;
  honorario: number;
};

export function somarHonorariosGrupo(membros: MembroGrupo[]): number {
  return Number(membros.reduce((s, m) => s + Number(m.honorario || 0), 0).toFixed(2));
}

// Observações do boleto do grupo: uma linha "RAZÃO SOCIAL — 00.000.000/0000-00" por empresa.
// O Inter aceita poucas linhas de mensagem; se exceder `maxLinhas`, mostra as (maxLinhas-1)
// primeiras e uma linha-resumo "e mais X empresa(s)".
export function montarObservacoesGrupo(membros: MembroGrupo[], maxLinhas = 5): string[] {
  const linhas = membros.map((m) => `${m.razaoSocial} — ${formatarDocumento(m.cpfCnpj)}`);
  if (linhas.length <= maxLinhas) return linhas;
  const visiveis = linhas.slice(0, maxLinhas - 1);
  const resto = linhas.length - visiveis.length;
  visiveis.push(`e mais ${resto} empresa${resto === 1 ? "" : "s"}`);
  return visiveis;
}
