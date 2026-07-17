import { Container } from "@/components/ui/Container";
import Link from "next/link";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";

const ITENS = [
  { href: "/financeiro/dashboard", label: "Dashboard financeiro" },
  { href: "/financeiro/indicadores", label: "Indicadores" },
  { href: "/financeiro/orcamento", label: "Orçamento" },
  { href: "/financeiro/orcado-realizado", label: "Orçado × Realizado" },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber" },
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar" },
  { href: "/financeiro/regua-cobranca", label: "Régua de cobrança" },
  { href: "/financeiro/reajuste", label: "Reajuste anual de honorários" },
  { href: "/financeiro/conciliacao", label: "Conciliação bancária" },
  { href: "/financeiro/rentabilidade", label: "Rentabilidade por cliente" },
  { href: "/financeiro/relatorios", label: "Relatórios" },
  { href: "/financeiro/cadastros/contas", label: "Contas bancárias" },
  { href: "/financeiro/cadastros/plano-de-contas", label: "Plano de contas" },
  { href: "/financeiro/cadastros/centros-de-custo", label: "Centros de custo" },
  { href: "/financeiro/cadastros/fornecedores", label: "Fornecedores" },
  { href: "/financeiro/cadastros/servicos", label: "Serviços" },
];

export default async function CadastrosHubPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/" />
      <PageHeader titulo="Financeiro" subtitulo="Painéis, movimentações e cadastros do escritório" />
      {/* auto-rows-fr: todas as linhas do grid com a MESMA altura. Sem isso, a linha que tem
          um rótulo de duas linhas ("Reajuste anual de honorários") fica mais alta que as
          outras, e o grid vira uma escada. O h-full abaixo estica o card até a linha. */}
      <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITENS.map((i) => (
          <li key={i.href}>
            {/* h-full: sem isso o card cresce quando o rótulo quebra em duas linhas ("Reajuste
                anual de honorários") e os vizinhos da mesma linha ficam menores que ele. */}
            <Link
              href={i.href}
              className="flex h-full items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
            >
              <span className="font-medium text-texto">{i.label}</span>
              <svg
                className="shrink-0 text-cinza-claro"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
