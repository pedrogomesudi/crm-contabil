import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { GerenciadorTemplates } from "./GerenciadorTemplates";
import { ToggleAlertas } from "./ToggleAlertas";
import { listarTemplates } from "@/app/(app)/onboarding/template-actions";
import { obterAlertasAtivos } from "@/app/(app)/onboarding/alertas-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const templates = await listarTemplates();
  const alertasAtivos = await obterAlertasAtivos();
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Modelos de processo de entrada de clientes" />
      <section className="rounded-2xl border border-linha bg-white p-4">
        <h3 className="font-display text-sm font-semibold text-texto">Notificações de prazo</h3>
        <p className="mb-2 text-xs text-cinza">
          Liga/desliga o badge no menu e a tela de alertas de prazo do onboarding.
        </p>
        <ToggleAlertas ativoInicial={alertasAtivos} />
      </section>
      <GerenciadorTemplates templates={templates} />
    </Container>
  );
}
