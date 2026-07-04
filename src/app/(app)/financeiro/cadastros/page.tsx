import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

const ITENS = [
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
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-slate-900">Cadastros financeiros</h1>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ITENS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
