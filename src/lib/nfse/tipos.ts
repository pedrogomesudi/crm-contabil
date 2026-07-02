export type Certificado = { certPem: string; keyPem: string; pfx: Buffer; senha: string; validade: Date };
export type Tomador = { documento: string; razaoSocial: string; email?: string; endereco?: Record<string, string> };
export type ConfigFiscal = {
  cnpj: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  codigoMunicipio: string;
  uf: string;
  itemLc116: string;
  codigoTributacaoMunicipal: string;
  aliquotaIss: number;
  naturezaOperacao: string;
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
