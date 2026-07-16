import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { AlertasView } from "./AlertasView";
import { listarAlertas, obterAlertasAtivos } from "../alertas-actions";

export default async function AlertasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const alertas = await listarAlertas();
  const ativos = await obterAlertasAtivos();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Alertas de prazo" subtitulo="Itens do onboarding vencendo ou vencidos" />
      {!ativos && (
        <p className="rounded-lg bg-creme px-3 py-2 text-sm text-cinza">
          Notificações de prazo desativadas nas configurações.
        </p>
      )}
      <AlertasView alertas={alertas} />
    </main>
  );
}
