import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";

const ITENS = [
  { href: "/financeiro/dashboard", label: "Dashboard financeiro" },
  { href: "/financeiro/orcamento", label: "Orçamento" },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber" },
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar" },
  { href: "/financeiro/regua-cobranca", label: "Régua de cobrança" },
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
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Financeiro" subtitulo="Painéis, movimentações e cadastros do escritório" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITENS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex items-center justify-between rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
            >
              <span className="font-medium text-texto">{i.label}</span>
              <svg className="text-cinza-claro" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
