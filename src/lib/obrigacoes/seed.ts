export type ObrigacaoSeed = {
  codigo: string;
  nome: string;
  descricao: string | null;
  esfera: "federal" | "estadual" | "municipal" | "trabalhista";
  periodicidade: "mensal" | "trimestral" | "anual";
  aplicavelA: string[];
  condicaoFlags: string[];
  condicaoModo: "any" | "all";
  ufs: string[];
  cnaePrefixos: string[];
  vencDia: number;
  vencMesOffset: number;
  vencMes: number | null;
  vencAnoOffset: number;
  prazoInternoDiasUteis: number;
  antecipa: boolean;
  ordem: number;
  // Curadoria: a norma que fixa o prazo. É o que permite auditar se a regra ainda vale —
  // e o que a tela mostra ao lado do vencimento.
  baseLegal: string;
  fonteUrl: string | null;
  // Preenchida quando a norma NÃO é exatamente representável no modelo de vencimento
  // (que só sabe "dia fixo do mês"). Registrar a imprecisão é melhor que escondê-la.
  observacaoCuradoria: string | null;
};

const SIMPLES = ["simples_sem_func", "simples_com_func"];

const URL_SIMPLES = "https://www8.receita.fazenda.gov.br/simplesnacional/";
const URL_SPED = "http://sped.rfb.gov.br/";

// NENHUMA entrada nasce com data de revisão: a base legal abaixo é ponto de partida, não
// conferência. Quem confere é o contador, na tela, item a item.
export const MATRIZ_PADRAO: ObrigacaoSeed[] = [
  {
    codigo: "DASN-SIMEI",
    nome: "DASN-SIMEI",
    descricao: "Declaração anual do MEI.",
    esfera: "federal",
    periodicidade: "anual",
    aplicavelA: ["mei"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 31,
    vencMesOffset: 1,
    vencMes: 5,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 10,
    baseLegal: "Resolução CGSN nº 140/2018 (declaração anual do SIMEI) — entrega até 31/05.",
    fonteUrl: URL_SIMPLES,
    observacaoCuradoria: null,
  },
  {
    codigo: "PGDAS-D",
    nome: "PGDAS-D",
    descricao: "Apuração mensal do Simples Nacional.",
    esfera: "federal",
    periodicidade: "mensal",
    aplicavelA: SIMPLES,
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 20,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 20,
    baseLegal: "Resolução CGSN nº 140/2018 — declaração e recolhimento até o dia 20 do mês subsequente.",
    fonteUrl: URL_SIMPLES,
    observacaoCuradoria: null,
  },
  {
    codigo: "DEFIS",
    nome: "DEFIS",
    descricao: "Declaração de Informações Socioeconômicas e Fiscais.",
    esfera: "federal",
    periodicidade: "anual",
    aplicavelA: SIMPLES,
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 31,
    vencMesOffset: 1,
    vencMes: 3,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 30,
    baseLegal: "Resolução CGSN nº 140/2018 — entrega até 31/03 do ano seguinte.",
    fonteUrl: URL_SIMPLES,
    observacaoCuradoria: null,
  },
  {
    codigo: "DCTFWEB",
    nome: "DCTFWeb",
    descricao: "Declaração de débitos previdenciários e de outros tributos federais.",
    esfera: "federal",
    periodicidade: "mensal",
    aplicavelA: ["*"],
    condicaoFlags: ["tem_folha"],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    // Estava 20 e a norma diz 15. O erro viveu no repositório sem nada que o apontasse —
    // é o caso que motivou esta fatia.
    vencDia: 15,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 40,
    baseLegal:
      "IN RFB nº 2.005/2021 (alterada até a IN RFB nº 2.237/2024) — até o dia 15 do mês seguinte ao dos fatos geradores.",
    fonteUrl: "https://www.gov.br/receitafederal/",
    observacaoCuradoria: null,
  },
  {
    codigo: "FGTS-DIGITAL",
    nome: "FGTS Digital",
    descricao: "Recolhimento do FGTS.",
    esfera: "trabalhista",
    periodicidade: "mensal",
    aplicavelA: ["*"],
    condicaoFlags: ["tem_folha"],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 20,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 50,
    baseLegal: "Lei nº 8.036/1990 c/c FGTS Digital — vencimento no dia 20 do mês seguinte desde 01/04/2024.",
    fonteUrl: "https://www.fgts.gov.br/Paginas/empregador/fgts-digital.aspx",
    observacaoCuradoria:
      "Antes do FGTS Digital o vencimento era dia 7. Competências anteriores a 04/2024 seguem a regra antiga.",
  },
  {
    codigo: "EFD-CONTRIB",
    nome: "EFD-Contribuições",
    descricao: "PIS/COFINS.",
    esfera: "federal",
    periodicidade: "mensal",
    aplicavelA: ["presumido_real"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 15,
    vencMesOffset: 2,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 60,
    baseLegal: "IN RFB nº 1.252/2012 — até o 10º dia útil do 2º mês subsequente ao da escrituração.",
    fonteUrl: URL_SPED,
    observacaoCuradoria:
      "APROXIMAÇÃO: a norma manda o 10º DIA ÚTIL do 2º mês; o modelo só sabe dia fixo, e usa o dia 15 com antecipação. O 10º dia útil cai entre 12 e 16 conforme o mês — conferir nas competências em que a diferença importa.",
  },
  {
    codigo: "EFD-REINF",
    nome: "EFD-Reinf",
    descricao: "Retenções e informações da contribuição previdenciária.",
    esfera: "federal",
    periodicidade: "mensal",
    aplicavelA: ["presumido_real"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 15,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 70,
    baseLegal: "IN RFB nº 2.043/2021, art. 6º — transmissão até o dia 15 do mês seguinte ao da competência.",
    fonteUrl: URL_SPED,
    observacaoCuradoria: null,
  },
  {
    codigo: "ECD",
    nome: "ECD",
    descricao: "Escrituração Contábil Digital.",
    esfera: "federal",
    periodicidade: "anual",
    aplicavelA: ["presumido_real"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 31,
    vencMesOffset: 1,
    vencMes: 5,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 80,
    baseLegal: "IN RFB nº 2.003/2021 — até o último dia útil de maio do ano seguinte ao da escrituração.",
    fonteUrl: URL_SPED,
    observacaoCuradoria:
      "A norma diz ÚLTIMO DIA ÚTIL de maio; aqui é dia 31 com antecipação para dia útil, o que dá o mesmo resultado.",
  },
  {
    codigo: "ECF",
    nome: "ECF",
    descricao: "Escrituração Contábil Fiscal.",
    esfera: "federal",
    periodicidade: "anual",
    aplicavelA: ["presumido_real"],
    condicaoFlags: [],
    condicaoModo: "any",
    ufs: [],
    cnaePrefixos: [],
    vencDia: 31,
    vencMesOffset: 1,
    vencMes: 7,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
    ordem: 90,
    baseLegal: "IN RFB nº 2.004/2021 — até o último dia útil de julho do ano seguinte ao do período.",
    fonteUrl: URL_SPED,
    observacaoCuradoria:
      "A norma diz ÚLTIMO DIA ÚTIL de julho; aqui é dia 31 com antecipação para dia útil, o que dá o mesmo resultado.",
  },
];
