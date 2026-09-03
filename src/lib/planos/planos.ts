// Planos comerciais do SALDO (instância-por-cliente): cada deploy sabe o próprio plano, gravado
// em escritorio_config.plano. Os planos são CUMULATIVOS — um plano mais alto inclui os módulos
// dos mais baixos. Este arquivo é a fonte única de "qual plano libera qual módulo" e é puro
// (testado sem DOM/DB), no mesmo espírito de lib/ui/navegacao e permissoes.

export const PLANOS = ["contratos", "relacionamento", "financeiro", "contabil", "enterprise"] as const;
export type Plano = (typeof PLANOS)[number];

// Ordem crescente de abrangência. `planoAtinge` compara por esta ordem.
const ORDEM: Record<Plano, number> = {
  contratos: 0,
  relacionamento: 1,
  financeiro: 2,
  contabil: 3,
  enterprise: 4,
};

// Plano padrão de uma instância sem configuração explícita: o mais completo, para NUNCA esconder
// um módulo de quem já usa (a instância atual da ELEVARE). Vender um plano menor é setar a coluna.
export const PLANO_PADRAO: Plano = "contabil";

export function ehPlano(v: unknown): v is Plano {
  return typeof v === "string" && (PLANOS as readonly string[]).includes(v);
}

export function planoDe(v: unknown): Plano {
  return ehPlano(v) ? v : PLANO_PADRAO;
}

// true quando o plano da instância alcança (é igual ou superior a) o plano mínimo exigido.
export function planoAtinge(plano: Plano, minimo: Plano): boolean {
  return ORDEM[plano] >= ORDEM[minimo];
}

// Módulos gateáveis. Início/Configurações não entram: são base de toda instância.
export type Modulo =
  | "clientes"
  | "documentos"
  | "comercial"
  | "onboarding"
  | "comunicados"
  | "nps"
  | "atendimento"
  | "solicitacoes"
  | "nfse"
  | "financeiro"
  | "obrigacoes"
  | "vencimentos"
  | "alertas_receita"
  | "legalizacao"
  | "tarefas"
  | "timesheet";

// Plano MÍNIMO que libera cada módulo (mapa aprovado comercialmente).
const MODULO_PLANO: Record<Modulo, Plano> = {
  // base (Contratos)
  clientes: "contratos",
  documentos: "contratos",
  comercial: "contratos",
  onboarding: "contratos",
  // Relacionamento
  comunicados: "relacionamento",
  nps: "relacionamento",
  atendimento: "relacionamento",
  solicitacoes: "relacionamento",
  nfse: "relacionamento",
  // Financeiro
  financeiro: "financeiro",
  // Contábil/Fiscal
  obrigacoes: "contabil",
  vencimentos: "contabil",
  alertas_receita: "contabil",
  legalizacao: "contabil",
  tarefas: "contabil",
  timesheet: "contabil",
};

export function planoMinimoDoModulo(modulo: Modulo): Plano {
  return MODULO_PLANO[modulo];
}

// O módulo está ativo para o plano da instância?
export function moduloAtivo(plano: Plano, modulo: Modulo): boolean {
  return planoAtinge(plano, MODULO_PLANO[modulo]);
}
