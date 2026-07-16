// Dados de mentira, só para a vitrine: o banco de dev está vazio por decisão da separação
// de ambientes, e tela vazia não deixa avaliar layout. Nada aqui vai para o banco.
export const CONTADORES_FICTICIOS = [
  { id: "c1", nome: "Ana Souza" },
  { id: "c2", nome: "Bruno Lima" },
];

export type ClienteFicticio = typeof CLIENTE_FICTICIO;

export const CLIENTE_FICTICIO = {
  id: "f1",
  tipo_pessoa: "PJ",
  cpf_cnpj: "12345678000190",
  razao_social: "ACME Indústria e Comércio Ltda",
  nome_fantasia: "ACME",
  regime_tributario: "Simples",
  inscricao_estadual: "123.456.789.000",
  inscricao_municipal: "98765",
  email: "financeiro@acme.com.br",
  telefone: "34999887766",
  responsavel_nome: "Carlos Pereira",
  endereco: {
    logradouro: "Avenida Rondon Pacheco",
    numero: "1200",
    complemento: "Sala 12",
    bairro: "Tibery",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38400000",
  },
  contador_id: "c1",
  status: "ativo",
  data_inicio: "2024-07-01",
  atualizado_em: "2026-07-16T12:00:00.000Z",
};

export const CLIENTES_FICTICIOS = [
  {
    id: "f1",
    razao_social: "ACME Indústria e Comércio Ltda",
    cpf_cnpj: "12345678000190",
    regime_tributario: "Simples",
    status: "ativo",
  },
  {
    id: "f2",
    razao_social: "Beta Serviços ME",
    cpf_cnpj: "98765432000110",
    regime_tributario: "Presumido",
    status: "ativo",
  },
  {
    id: "f3",
    razao_social: "Gama Transportes S.A.",
    cpf_cnpj: "11222333000144",
    regime_tributario: "Real",
    status: "inativo",
  },
  {
    id: "f4",
    razao_social: "Delta Consultoria",
    cpf_cnpj: null,
    regime_tributario: null,
    status: "em_constituicao",
  },
];
