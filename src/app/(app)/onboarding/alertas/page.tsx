import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { AlertasView } from "./AlertasView";
import { listarAlertas } from "../alertas-actions";

export default async function AlertasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const alertas = await listarAlertas();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Alertas de prazo" subtitulo="Itens do onboarding vencendo ou vencidos" />
      <AlertasView alertas={alertas} />
    </main>
  );
}
