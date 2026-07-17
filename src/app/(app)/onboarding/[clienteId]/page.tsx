import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProcessoSection } from "@/components/onboarding/ProcessoSection";
import { listarProcessoCliente } from "@/app/(app)/clientes/[id]/processo";
import { sugerirPerfil } from "@/lib/onboarding/processo";
import { listarTemplatesAtivos } from "@/app/(app)/onboarding/template-actions";

export default async function OnboardingClientePage({ params }: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razao_social, tipo_pessoa, regime_tributario")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) notFound();

  const proc = await listarProcessoCliente(clienteId);
  const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
  const usuarios = (us as { id: string; nome: string }[] | null) ?? [];
  const templates = await listarTemplatesAtivos();
  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("qtd_funcionarios")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const perfilSugerido = sugerirPerfil(
    String(cliente.tipo_pessoa ?? "PJ"),
    String(cliente.regime_tributario ?? ""),
    (fin?.qtd_funcionarios as number | null) ?? null,
  );
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-4">
      <PageHeader titulo={cliente.razao_social as string} subtitulo="Onboarding do cliente" />
      <Link href={`/clientes/${clienteId}`} className="text-sm text-verde underline">
        Ver cadastro completo
      </Link>
      {proc && (
        <ProcessoSection
          clienteId={clienteId}
          processo={proc.processo}
          itens={proc.itens}
          progresso={proc.progresso}
          usuarios={usuarios}
          podeRevelar={podeRevelarCredencial(perfil.papel)}
          perfilSugerido={perfilSugerido}
          hoje={hoje}
          templates={templates}
        />
      )}
    </main>
  );
}
