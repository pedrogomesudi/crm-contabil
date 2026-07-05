import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { DashboardFinanceiro } from "@/components/financeiro/DashboardFinanceiro";
import { carregarDashboard } from "./actions";

export default async function DashboardFinanceiroPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeVerHonorario(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const mes = hoje.slice(0, 7);
  const dados = await carregarDashboard(`${mes}-01`);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Dashboard financeiro</h1>
      {dados ? (
        <DashboardFinanceiro mesInicial={mes} dadosIniciais={dados} />
      ) : (
        <p className="text-sm text-red-600">Não foi possível carregar os dados.</p>
      )}
    </main>
  );
}
