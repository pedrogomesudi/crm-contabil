export type BoletoProvedor = "inter" | "asaas";

export type DadosEmissao = {
  valor: number;
  vencimento: string; // YYYY-MM-DD
  pagadorNome: string;
  pagadorDocumento: string; // CPF/CNPJ (dígitos)
  pagadorEmail: string | null;
  descricao: string;
  seuNumero: string;
  // Linhas de observação impressas no boleto (mensagem ao pagador). Usado no boleto de grupo
  // para listar razão social + CNPJ das empresas. Provedores que não suportam ignoram.
  observacoes?: string[];
  pagadorEndereco?: {
    cep: string;
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
  } | null;
};

export type BoletoEmitido = {
  provedorBoletoId: string;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  urlPdf: string | null;
};

export type EventoPagamento = {
  provedorBoletoId: string;
  pago: boolean;
  valorPago: number | null;
  pagoEm: string | null;
};

export interface ProvedorBoleto {
  emitir(dados: DadosEmissao): Promise<BoletoEmitido>;
  interpretarWebhook(payload: unknown): EventoPagamento | null;
  pdf?(provedorBoletoId: string): Promise<string | null>;
  registrarWebhook?(url: string): Promise<void>;
  consultarWebhook?(): Promise<string | null>;
  consultarPagamento?(provedorBoletoId: string): Promise<EventoPagamento | null>;
  cancelar?(provedorBoletoId: string, motivo: string): Promise<void>;
}
