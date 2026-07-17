import Link from "next/link";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";

const RELATORIOS = [
  { href: "/financeiro/relatorios/dre", label: "DRE", desc: "Demonstração de Resultado por período." },
  {
    href: "/financeiro/relatorios/extrato",
    label: "Extrato / movimentações",
    desc: "Lançamentos e baixas com filtros e export CSV.",
  },
  {
    href: "/financeiro/relatorios/fluxo",
    label: "Fluxo de caixa detalhado",
    desc: "Realizado e projetado, mês a mês, com saldo acumulado.",
  },
];

export default async function RelatoriosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Relatórios" subtitulo="Relatórios financeiros" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {RELATORIOS.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="block rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
            >
              <span className="block font-medium text-texto">{r.label}</span>
              <span className="mt-0.5 block text-xs text-cinza">{r.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
