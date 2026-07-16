import type { TemplateBloco, TemplateItem } from "./processo";

type Opts = Partial<
  Pick<
    TemplateItem,
    | "descricao"
    | "tipo"
    | "condicaoFlags"
    | "condicaoModo"
    | "bloqueante"
    | "anexoObrigatorio"
    | "alertaRisco"
    | "dependeDe"
    | "campoDestino"
  >
>;
const PJ = ["mei", "simples_sem_func", "simples_com_func", "presumido_real"];
const COM_FUNC = ["simples_com_func", "presumido_real"];
const NAO_MEI = ["simples_sem_func", "simples_com_func", "presumido_real"];

function it(
  codigo: string,
  titulo: string,
  papel: string | null,
  prazoDias: number | null,
  aplicavelA: string[],
  ordem: number,
  o: Opts = {},
): TemplateItem {
  return {
    codigo,
    titulo,
    descricao: o.descricao ?? null,
    tipo: o.tipo ?? "padrao",
    responsavelPapel: papel,
    prazoDias,
    aplicavelA,
    condicaoFlags: o.condicaoFlags ?? [],
    condicaoModo: o.condicaoModo ?? "all",
    bloqueante: o.bloqueante ?? false,
    anexoObrigatorio: o.anexoObrigatorio ?? false,
    alertaRisco: o.alertaRisco ?? null,
    ordem,
    dependeDe: o.dependeDe ?? [],
    campoDestino: o.campoDestino ?? null,
  };
}

export const TEMPLATE_PADRAO: { slug: string; nome: string; descricao: string; blocos: TemplateBloco[] } = {
  slug: "onboarding-cliente-existente",
  nome: "Onboarding — Cliente já constituído (transferência de contabilidade)",
  descricao: "Entrada de cliente PJ/PF já constituído, com transição do contador anterior.",
  blocos: [
    {
      ordem: 1,
      nome: "Formalização da relação",
      prazoBlocoDias: 3,
      itens: [
        it("1.1", "Contrato de prestação de serviços contábeis assinado", "admin", 0, ["*"], 1, {
          bloqueante: true,
          anexoObrigatorio: true,
        }),
        it("1.2", "Comunicação formal ao contador anterior", "contador", 2, PJ, 2, {
          condicaoFlags: ["possui_contador_anterior"],
          anexoObrigatorio: true,
        }),
        it("1.3", "Definição da data de corte (competência inicial)", "contador", 1, ["*"], 3, {
          bloqueante: true,
          campoDestino: "competencia_inicial",
        }),
        it("1.4", "Cadastro do cliente no CRM com responsáveis internos", "admin", 1, ["*"], 4, { bloqueante: true }),
      ],
    },
    {
      ordem: 2,
      nome: "Dados cadastrais e societários",
      prazoBlocoDias: 7,
      itens: [
        it("2.1", "Cartão CNPJ e consulta de situação cadastral", "assistente", 3, PJ, 1, { anexoObrigatorio: true }),
        it("2.2", "Contrato social consolidado / última alteração", "assistente", 5, PJ, 2, { anexoObrigatorio: true }),
        it("2.3", "Documentos dos sócios / titular", "assistente", 5, ["*"], 3, { anexoObrigatorio: true }),
        it("2.4", "Inscrições, alvará e licenças", "assistente", 7, NAO_MEI, 4, {
          condicaoFlags: ["atividade_exige_licencas"],
        }),
        it("2.5", "Verificação de regime tributário e enquadramento", "contador", 7, PJ, 5),
        it("2.6", "Conferência de CNAEs versus atividades exercidas", "contador", 7, PJ, 6),
      ],
    },
    {
      ordem: 3,
      nome: "Acessos, certificados e procurações",
      prazoBlocoDias: 10,
      itens: [
        it("3.1", "Certificado digital cadastrado no CRM", "assistente", 5, NAO_MEI, 1, { bloqueante: true }),
        it(
          "3.2",
          "Procuração eletrônica e-CAC outorgada ao escritório",
          "assistente",
          7,
          ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"],
          2,
          { bloqueante: true },
        ),
        it("3.3", "Procurações SEFAZ estadual e prefeitura (NFS-e)", "assistente", 10, NAO_MEI, 3),
        it("3.4", "Domicílios tributários eletrônicos verificados", "contador", 10, PJ, 4, {
          alertaRisco: "Intimação não lida pode ter prazo em curso",
        }),
        it("3.5", "Acessos registrados no cofre de senhas", "assistente", 10, ["*"], 5, { tipo: "acesso" }),
        it("3.6", "Vínculo eSocial / Conectividade Social", "assistente", 10, COM_FUNC, 6, {
          condicaoFlags: ["possui_funcionarios", "possui_prolabore"],
          condicaoModo: "any",
        }),
      ],
    },
    {
      ordem: 4,
      nome: "Transição do contador anterior",
      prazoBlocoDias: 20,
      itens: [
        it("4.1", "Balancete acumulado, razão e diário do exercício corrente", "contador", 15, NAO_MEI, 1, {
          condicaoFlags: ["possui_contador_anterior"],
          anexoObrigatorio: true,
        }),
        it("4.2", "Balanço e ECD/ECF dos últimos exercícios", "contador", 15, NAO_MEI, 2, {
          condicaoFlags: ["possui_contador_anterior"],
          anexoObrigatorio: true,
        }),
        it("4.3", "SPEDs e declarações do ano corrente com recibos", "contador", 15, NAO_MEI, 3, {
          condicaoFlags: ["possui_contador_anterior"],
          anexoObrigatorio: true,
        }),
        it("4.4", "Últimas guias pagas (DAS/DARF/GPS/FGTS)", "assistente", 15, PJ, 4, { anexoObrigatorio: true }),
        it("4.5", "Cadastro completo do departamento pessoal", "contador", 15, COM_FUNC, 5, {
          condicaoFlags: ["possui_funcionarios"],
          anexoObrigatorio: true,
        }),
        it("4.6", "Plano de contas e saldos de abertura", "contador", 18, NAO_MEI, 6, {
          condicaoFlags: ["possui_contador_anterior"],
          bloqueante: true,
        }),
        it("4.7", "Levantamento de passivos ocultos", "contador", 20, PJ, 7, {
          alertaRisco: "Pendências pré-existentes devem estar documentadas antes da data de corte",
          anexoObrigatorio: true,
        }),
        it("4.8", "Termo de recebimento de acervo documental", "contador", 20, NAO_MEI, 8, {
          condicaoFlags: ["possui_contador_anterior"],
          anexoObrigatorio: true,
        }),
      ],
    },
    {
      ordem: 5,
      nome: "Operação corrente",
      prazoBlocoDias: 20,
      itens: [
        it("5.1", "Extratos bancários e definição do fluxo de envio", "assistente", 10, ["*"], 1),
        it("5.2", "Acesso/integração ao ERP ou emissor de notas do cliente", "contador", 15, NAO_MEI, 2, {
          condicaoFlags: ["possui_erp"],
        }),
        it("5.3", "Levantamento do volume operacional", "contador", 15, NAO_MEI, 3),
        it("5.4", "Mapeamento de particularidades fiscais", "contador", 20, COM_FUNC, 4, {
          condicaoFlags: ["complexidade_alta"],
        }),
      ],
    },
    {
      ordem: 6,
      nome: "Parametrização interna",
      prazoBlocoDias: 25,
      itens: [
        it("6.1", "Cliente configurado no software contábil", "contador", 22, NAO_MEI, 1, {
          bloqueante: true,
          dependeDe: ["4.6"],
        }),
        it("6.2", "Matriz de obrigações ativada e calendário gerado", "contador", 22, ["*"], 2, {
          bloqueante: true,
          dependeDe: ["1.3", "2.5"],
        }),
        it("6.3", "Contrato de honorários lançado no financeiro", "financeiro", 5, ["*"], 3, {
          bloqueante: true,
          dependeDe: ["1.1"],
        }),
        it("6.4", "Portal do cliente criado e testado", "assistente", 22, ["*"], 4),
      ],
    },
    {
      ordem: 7,
      nome: "Kickoff e comunicação",
      prazoBlocoDias: 30,
      itens: [
        it("7.1", "Reunião de boas-vindas realizada", "contador", 25, ["*"], 1),
        it("7.2", "Rotina mensal comunicada por escrito", "assistente", 25, ["*"], 2),
        it("7.3", "Pesquisa de expectativa inicial", "assistente", 30, ["*"], 3),
        it("7.4", "Encerramento do onboarding e revisão interna", "contador", 30, ["*"], 4, { bloqueante: true }),
      ],
    },
  ],
};
