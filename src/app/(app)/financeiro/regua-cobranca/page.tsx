import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { Regua } from "./Regua";
import { listarEtapas, lerReguaAtiva, historicoRegua } from "./actions";

export default async function ReguaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const [ativa, etapas, historico] = await Promise.all([lerReguaAtiva(), listarEtapas(), historicoRegua()]);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <Voltar href="/financeiro/cadastros" />
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Régua de cobrança</h1>
      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        O disparo diário automático depende do agendador externo (ver README). O botão “Processar agora” roda a régua na hora.
      </p>
      <Regua ativaInicial={ativa} etapas={etapas} historico={historico} />
    </main>
  );
}
