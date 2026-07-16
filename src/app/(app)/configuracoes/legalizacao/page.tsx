import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarModelos } from "./actions";
import { ModelosLista } from "./ModelosLista";

export const metadata = { title: "Modelos de legalização" };

export default async function ModelosLegalizacaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const modelos = await listarModelos();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader
        titulo="Modelos de legalização"
        subtitulo="Processos societários e de legalização — etapas por órgão"
      />
      <ModelosLista modelos={modelos} />
    </main>
  );
}
