import type { Papel } from "@/lib/tipos";
import {
  podeAtender,
  podeAtenderSolicitacoes,
  podeCriarCliente,
  podeGerenciarVencimentos,
} from "@/lib/clientes/permissoes";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

export type ItemMenu = { href: string; label: string; badge?: number };
export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };
export type Badges = { onboarding: number; riscos: number; escalonamento: number; vencimentos: number; docsVencidos: number };

// O mapa do menu é DADO, não markup: quem vê o quê é regra, e regra se testa sem DOM.
// Segue o padrão do projeto (filtroStatus.ts, busca.ts e permissoes.ts são puros e testados).
//
// Os grupos vêm do que INTERAGE de fato — medido no grafo de links entre módulos, não da
// estrutura de pastas. Obrigações e Vencimentos moravam dentro de "Clientes" por falta de
// lugar melhor; nada naquele nome sugere conformidade fiscal.
//
// `titulo: null` = itens soltos, sem cabeçalho de grupo (Início, Configurações).
export function menuDoPapel(papel: Papel, badges: Badges): GrupoMenu[] {
  const equipe = podeCriarCliente(papel); // admin, assistente, contador
  const grupos: GrupoMenu[] = [
    { titulo: null, itens: [{ href: "/", label: "Início" }] },
    {
      titulo: "Operação",
      itens: [
        { href: "/clientes", label: "Clientes" },
        { href: "/documentos", label: "Documentos", badge: badges.docsVencidos },
        ...(equipe ? [{ href: "/obrigacoes", label: "Obrigações", badge: badges.riscos + badges.escalonamento }] : []),
        ...(podeGerenciarVencimentos(papel)
          ? [{ href: "/vencimentos", label: "Vencimentos", badge: badges.vencimentos }]
          : []),
        { href: "/tarefas", label: "Tarefas" },
        { href: "/timesheet", label: "Timesheet" },
      ],
    },
    {
      titulo: "Entrada",
      itens: equipe
        ? [
            { href: "/comercial", label: "Comercial" },
            { href: "/onboarding", label: "Onboarding", badge: badges.onboarding },
            { href: "/legalizacao", label: "Legalização" },
          ]
        : [],
    },
    {
      titulo: "Relacionamento",
      itens: [
        ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento" }] : []),
        ...(podeAtenderSolicitacoes(papel) ? [{ href: "/solicitacoes", label: "Solicitações" }] : []),
        { href: "/comunicados", label: "Comunicados" },
      ],
    },
    {
      titulo: "Financeiro",
      itens: podeGerenciarFinanceiro(papel) ? [{ href: "/financeiro/cadastros", label: "Financeiro" }] : [],
    },
    {
      titulo: null,
      itens: ["admin", "assistente"].includes(papel) ? [{ href: "/configuracoes", label: "Configurações" }] : [],
    },
  ];

  return (
    grupos
      // Um grupo sem item visível viraria um título órfão — é o que acontece com "Entrada"
      // para o papel financeiro, que não vê Comercial/Onboarding/Legalização.
      .filter((g) => g.itens.length > 0)
      // badge 0 vira undefined: bolinha vazia é ruído, não informação.
      .map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, badge: i.badge || undefined })) }))
  );
}
