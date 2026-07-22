import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { decidirGateAal } from "@/lib/auth/mfa";
import { mfaObrigatorio } from "@/lib/auth/mfaConfig";
import { podeCriarCliente, podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { ehCliente } from "@/lib/portal/permissoes";
import { contarVencimentos } from "@/app/(app)/vencimentos/actions";
import { contarAlertas } from "@/app/(app)/onboarding/alertas-actions";
import { contarRiscos } from "@/app/(app)/obrigacoes/actions";
import { contarEscalonamento } from "@/app/(app)/obrigacoes/escalonamento-actions";
import { contarDocsVencidos } from "@/app/(app)/documentos/actions";
import { contarAlertasReceita } from "@/app/(app)/clientes/alertas-receita/actions";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfilAtual();
  // Sem sessão, sem perfil válido ou desativado => encerra sessão (evita loop) e
  // manda ao login.
  if (!perfil || !perfil.ativo) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
    redirect("/login");
  }

  // Cliente do portal NUNCA entra nas telas da equipe (o gate espelhado vive no
  // layout do grupo (portal)). Vem antes das contagens: o cliente não dispara
  // nenhuma query de equipe.
  if (ehCliente(perfil.papel)) redirect("/portal");

  // Gate MFA (Fatia A, obrigatorio=false): quem TEM fator verificado (nextLevel aal2) mas ainda
  // está numa sessão aal1 precisa passar pela verificação. É isto que efetivamente exige o 2FA
  // de quem o habilitou — o login em si não muda. Sem fator, segue normal (opcional).
  const supabaseMfa = await createServerSupabase();
  const { data: aal } = await supabaseMfa.auth.mfa.getAuthenticatorAssuranceLevel();
  const decisao = decidirGateAal(
    { currentLevel: aal?.currentLevel ?? null, nextLevel: aal?.nextLevel ?? null },
    await mfaObrigatorio(),
  );
  // Tem fator mas sessão aal1 → desafiar. Sem fator e escritório exige → forçar cadastro.
  // Ambos os alvos ficam fora de (app), então não há loop de redirect.
  if (decisao === "verificar") redirect("/login/verificar");
  if (decisao === "enrollar") redirect("/conta/seguranca?exigido=1");

  const alertasOnboarding = podeCriarCliente(perfil.papel) ? await contarAlertas() : 0;
  const riscosObrigacoes = podeCriarCliente(perfil.papel) ? await contarRiscos() : 0;
  const escalonamento = podeCriarCliente(perfil.papel) ? await contarEscalonamento() : 0;
  const vencimentos = podeGerenciarVencimentos(perfil.papel) ? await contarVencimentos() : 0;
  const docsVencidos = perfil.papel === "admin" ? await contarDocsVencidos() : 0;
  const monitoramentoReceita = podeCriarCliente(perfil.papel) ? await contarAlertasReceita() : 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-texto focus:shadow"
      >
        Pular para o conteúdo
      </a>
      <Sidebar
        papel={perfil.papel}
        nome={perfil.nome}
        badges={{
          onboarding: alertasOnboarding,
          riscos: riscosObrigacoes,
          escalonamento,
          vencimentos,
          docsVencidos,
          monitoramentoReceita,
        }}
      />
      <main id="conteudo" className="flex-1 bg-creme p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
