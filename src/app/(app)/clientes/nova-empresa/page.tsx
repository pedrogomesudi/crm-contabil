import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores } from "@/lib/clientes/contadores";
import { podeCriarCliente, podeAtribuirContador } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormConstituicao } from "./FormConstituicao";

export const metadata = { title: "Nova empresa em constituição" };

export default async function NovaEmpresaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  if (!podeCriarCliente(perfil.papel)) redirect("/clientes");

  const contadores = podeAtribuirContador(perfil.papel, "novo") ? await listarContadores() : [];
  const supabase = await createServerSupabase();
  const { data: modelos } = await supabase
    .from("legalizacao_template")
    .select("id, nome")
    .in("tipo", ["abertura_simples", "abertura_presumido"])
    .eq("ativo", true)
    .order("nome");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <PageHeader
        titulo="Nova empresa em constituição"
        subtitulo="Cadastro da empresa nova (sem CNPJ) e início do processo de abertura"
      />
      <FormConstituicao
        contadores={contadores}
        contadorEditavel={contadores.length > 0}
        modelos={(modelos ?? []).map((m) => ({ id: m.id as string, nome: m.nome as string }))}
        hoje={hoje}
      />
    </main>
  );
}
