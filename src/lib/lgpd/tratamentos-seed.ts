// ROPA pré-semeado: os tratamentos típicos de um escritório contábil, com a base legal
// já preenchida. O contador ajusta — não precisa redigir um Registro de Atividades de
// Tratamento do zero nem descobrir a base legal de cada finalidade.
export type TratamentoSeed = {
  finalidade: string;
  categorias: string;
  base_legal: string;
  retencao: string;
  ordem: number;
};

export const TRATAMENTOS_SEED: TratamentoSeed[] = [
  {
    finalidade: "Dados cadastrais do cliente e representantes",
    categorias: "Nome, CPF, e-mail, telefone, endereço",
    base_legal: "contrato",
    retencao: "Durante o contrato e por 5 anos após o encerramento",
    ordem: 1,
  },
  {
    finalidade: "Escrituração contábil e fiscal",
    categorias: "Dados fiscais, documentos, notas fiscais",
    base_legal: "obrigacao_legal",
    retencao: "5 anos (decadência tributária — CTN art. 173/174)",
    ordem: 2,
  },
  {
    finalidade: "Folha de pagamento e obrigações trabalhistas",
    categorias: "Dados de empregados, remuneração, encargos",
    base_legal: "obrigacao_legal",
    retencao: "Conforme prazos trabalhistas/previdenciários (até 30 anos p/ FGTS histórico)",
    ordem: 3,
  },
  {
    finalidade: "Emissão de NFS-e",
    categorias: "Dados do tomador, valores, competência",
    base_legal: "obrigacao_legal",
    retencao: "5 anos",
    ordem: 4,
  },
  {
    finalidade: "Cobrança de honorários",
    categorias: "Nome, e-mail, telefone, valores em aberto",
    base_legal: "contrato",
    retencao: "Durante o contrato e o prazo prescricional da dívida",
    ordem: 5,
  },
  {
    finalidade: "Comunicados e avisos de legislação",
    categorias: "Nome, e-mail, telefone",
    base_legal: "consentimento",
    retencao: "Até a revogação do consentimento",
    ordem: 6,
  },
  {
    finalidade: "Atendimento (WhatsApp e e-mail)",
    categorias: "Nome, telefone, e-mail, conteúdo das mensagens",
    base_legal: "legitimo_interesse",
    retencao: "Enquanto necessário ao atendimento",
    ordem: 7,
  },
];
