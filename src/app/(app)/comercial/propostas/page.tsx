import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { PropostasLista } from "./PropostasLista";
import { TodasPropostas } from "./TodasPropostas";
import { listarPropostas, listarTodasPropostas } from "../propostas-actions";

export default async function PropostasPage({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const op = (await searchParams).op ?? "";

  if (!op) {
    const propostas = await listarTodasPropostas();
    return (
      <main className="mx-auto max-w-4xl space-y-5 p-4">
        <PageHeader titulo="Propostas" subtitulo="Todas as propostas de honorários" />
        <TodasPropostas propostas={propostas} />
      </main>
    );
  }

  const supabase = await createServerSupabase();
  const { data: oport } = await supabase.from("oportunidade").select("prospect_nome").eq("id", op).maybeSingle();
  const propostas = await listarPropostas(op);
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Propostas" subtitulo="Propostas de honorários da oportunidade" />
      <PropostasLista oportunidadeId={op} prospectNome={(oport?.prospect_nome as string) ?? "—"} propostas={propostas} />
    </main>
  );
}
