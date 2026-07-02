export type Certificado = { certPem: string; keyPem: string; pfx: Buffer; senha: string; validade: Date };
export type Tomador = { documento: string; razaoSocial: string; email?: string; endereco?: Record<string, string> };
export type ConfigFiscal = {
  cnpj: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  codigoMunicipio: string;
  uf: string;
  codigoServicoNacional: string; // cTribNac (6 dígitos), ex.: "170201"
  descricaoServico: string; // xDescServ, ex.: "Honorarios"
  aliquotaIss: number; // pAliq (usado quando NÃO Simples)
  pctTribSN: number; // pTotTribSN (% aproximado de tributos, Simples)
  simplesNacional: boolean;
  ambiente: "homologacao" | "producao";
};
export type DadosDps = {
  config: ConfigFiscal;
  tomador: Tomador;
  valor: number;
  competencia: string;
  serie: string;
  numeroDps: string;
};
export type ResultadoEmissao = {
  autorizada: boolean;
  chaveAcesso?: string;
  numero?: string;
  xmlNfse?: string;
  mensagens?: string[];
};

export type ResultadoCliente = {
  status: "autorizada" | "rejeitada" | "erro" | "pulada";
  chave?: string;
  numero?: string;
  motivo?: string;
};
export type SituacaoLote = "apta" | "ja_emitida" | "sem_documento";
export type ClienteLote = {
  clienteId: string;
  razaoSocial: string;
  documento: string;
  honorario: number;
  temEndereco: boolean;
  situacao: SituacaoLote;
};
export type LinhaRelatorio = {
  cliente: string;
  documento: string;
  competencia: string;
  valor: number;
  resultado: string;
  numero: string;
  chave: string;
  motivo: string;
};

export type DadosCancelamento = {
  chave: string;
  nDFSe: string;
  cnpj: string;
  ambiente: "homologacao" | "producao";
  cMotivo: "1" | "2" | "9";
  xMotivo: string;
};
export type ResultadoEvento = { aceito: boolean; idEvento?: string; mensagens?: string[]; xml?: string };
