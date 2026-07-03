import type { ConfigFiscal } from "./tipos";

// Campos de nfse_emitente usados na montagem da config fiscal.
export type EmitenteRow = {
  codigo_municipio: string | null;
  codigo_servico_nacional: string | null;
  aliquota_iss: number | null;
  pct_trib_sn: number | null;
  simples_nacional: boolean;
  descricao_servico_padrao: string | null;
  ambiente: string;
};

// Identidade do emitente reaproveitada do cadastro do cliente.
export type ClienteIdentidade = {
  cpf_cnpj: string | null;
  inscricao_municipal: string | null;
  razao_social: string;
  endereco: Record<string, string> | null;
};

// Monta o ConfigFiscal (tipo do motor) a partir do emitente + identidade do cliente.
// A descrição da nota tem prioridade; se vazia, usa a descrição padrão do emitente.
// dps.ts não usa uf/inscricaoMunicipal, mas os populamos por completude.
// Certificado válido = tem validade e ela ainda não passou. Isolado aqui (fora de
// componente) para não disparar react-hooks/purity ao usar o relógio no render.
export function certificadoValido(validade: string | null | undefined): boolean {
  if (!validade) return false;
  return new Date(validade).getTime() >= Date.now();
}

export function emitenteParaConfig(
  emitente: EmitenteRow,
  cliente: ClienteIdentidade,
  descricaoServico: string,
): ConfigFiscal {
  return {
    cnpj: String(cliente.cpf_cnpj ?? "").replace(/\D/g, ""),
    inscricaoMunicipal: cliente.inscricao_municipal ?? "",
    razaoSocial: cliente.razao_social,
    codigoMunicipio: emitente.codigo_municipio ?? "",
    uf: cliente.endereco?.uf ?? "",
    codigoServicoNacional: emitente.codigo_servico_nacional ?? "",
    descricaoServico: descricaoServico.trim() || emitente.descricao_servico_padrao || "Servico",
    aliquotaIss: Number(emitente.aliquota_iss ?? 0),
    pctTribSN: Number(emitente.pct_trib_sn ?? 0),
    simplesNacional: emitente.simples_nacional,
    ambiente: emitente.ambiente === "producao" ? "producao" : "homologacao",
  };
}
