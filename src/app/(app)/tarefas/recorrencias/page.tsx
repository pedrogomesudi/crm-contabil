import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas, podeGerenciarRecorrencias } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarRecorrencias } from "./actions";
import { FormRecorrencia } from "./FormRecorrencia";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "Tarefas recorrentes" };

export default async function RecorrenciasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");

  const recorrencias = await listarRecorrencias();
  const colaboradores = await listarColaboradores();
  const supabase = await createServerSupabase();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social")
    .limit(300);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/tarefas" label="Tarefas" />
      <PageHeader titulo="Tarefas recorrentes" subtitulo="Moldes que geram tarefas sozinhos, todo dia às 9h" />
      <FormRecorrencia
        recorrencias={recorrencias}
        colaboradores={colaboradores}
        clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
        hoje={hoje}
        editavel={podeGerenciarRecorrencias(perfil.papel)}
      />
    </Container>
  );
}
