import type { Papel } from "@/lib/tipos";
import {
  podeAtender,
  podeAtenderSolicitacoes,
  podeCriarCliente,
  podeGerenciarVencimentos,
} from "@/lib/clientes/permissoes";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { moduloAtivo, PLANO_PADRAO, type Modulo, type Plano } from "@/lib/planos/planos";

// modulo: quando presente, o item só aparece se o plano da instância libera aquele módulo.
export type ItemMenu = { href: string; label: string; badge?: number; modulo?: Modulo };
export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };
export type Badges = {
  onboarding: number;
  riscos: number;
  escalonamento: number;
  vencimentos: number;
  docsVencidos: number;
  monitoramentoReceita: number;
};

// O mapa do menu é DADO, não markup: quem vê o quê é regra, e regra se testa sem DOM.
// Segue o padrão do projeto (filtroStatus.ts, busca.ts e permissoes.ts são puros e testados).
//
// Os grupos vêm do que INTERAGE de fato — medido no grafo de links entre módulos, não da
// estrutura de pastas. Obrigações e Vencimentos moravam dentro de "Clientes" por falta de
// lugar melhor; nada naquele nome sugere conformidade fiscal.
//
// `titulo: null` = itens soltos, sem cabeçalho de grupo (Início, Configurações).
export function menuDoPapel(papel: Papel, badges: Badges, plano: Plano = PLANO_PADRAO): GrupoMenu[] {
  const equipe = podeCriarCliente(papel); // admin, assistente, contador
  const grupos: GrupoMenu[] = [
    { titulo: null, itens: [{ href: "/", label: "Início" }] },
    {
      titulo: "Operação",
      itens: [
        { href: "/clientes", label: "Clientes", modulo: "clientes" },
        { href: "/documentos", label: "Documentos", badge: badges.docsVencidos, modulo: "documentos" },
        ...(equipe
          ? [
              {
                href: "/obrigacoes",
                label: "Obrigações",
                badge: badges.riscos + badges.escalonamento,
                modulo: "obrigacoes" as const,
              },
            ]
          : []),
        ...(podeGerenciarVencimentos(papel)
          ? [{ href: "/vencimentos", label: "Vencimentos", badge: badges.vencimentos, modulo: "vencimentos" as const }]
          : []),
        { href: "/tarefas", label: "Tarefas", modulo: "tarefas" },
        { href: "/timesheet", label: "Timesheet", modulo: "timesheet" },
        ...(equipe
          ? [
              {
                href: "/clientes/alertas-receita",
                label: "Alertas Receita",
                badge: badges.monitoramentoReceita,
                modulo: "alertas_receita" as const,
              },
            ]
          : []),
      ],
    },
    {
      titulo: "Entrada",
      itens: equipe
        ? [
            { href: "/comercial", label: "Comercial", modulo: "comercial" as const },
            { href: "/onboarding", label: "Onboarding", badge: badges.onboarding, modulo: "onboarding" as const },
            { href: "/legalizacao", label: "Legalização", modulo: "legalizacao" as const },
          ]
        : [],
    },
    {
      titulo: "Relacionamento",
      itens: [
        ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento", modulo: "atendimento" as const }] : []),
        ...(podeAtenderSolicitacoes(papel)
          ? [{ href: "/solicitacoes", label: "Solicitações", modulo: "solicitacoes" as const }]
          : []),
        { href: "/comunicados", label: "Comunicados", modulo: "comunicados" },
        ...(podeCriarCliente(papel) ? [{ href: "/nps", label: "NPS", modulo: "nps" as const }] : []),
      ],
    },
    {
      titulo: "Financeiro",
      itens: podeGerenciarFinanceiro(papel)
        ? [{ href: "/financeiro/cadastros", label: "Financeiro", modulo: "financeiro" as const }]
        : [],
    },
    {
      titulo: null,
      itens: ["admin", "assistente"].includes(papel) ? [{ href: "/configuracoes", label: "Configurações" }] : [],
    },
  ];

  return (
    grupos
      // Filtra por PLANO: item com `modulo` só aparece se o plano da instância o libera. Itens sem
      // módulo (Início, Configurações) são base e ficam sempre.
      .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.modulo || moduloAtivo(plano, i.modulo)) }))
      // Um grupo sem item visível viraria um título órfão — descarta.
      .filter((g) => g.itens.length > 0)
      // badge 0 vira undefined: bolinha vazia é ruído, não informação.
      .map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, badge: i.badge || undefined })) }))
  );
}
