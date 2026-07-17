import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarApontamentos, sessaoAtual, podeVerDeTodos } from "./actions";
import { PainelTimesheet } from "./PainelTimesheet";

export const metadata = { title: "Timesheet" };

// Segunda-feira da semana corrente (o timesheet é lido por semana).
function inicioDaSemana(hoje: string): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const dt = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
  const diff = (dt.getUTCDay() + 6) % 7; // 0 = segunda
  const seg = new Date(dt.getTime() - diff * 86_400_000);
  return seg.toISOString().slice(0, 10);
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; usuarioId?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || inicioDaSemana(hoje);
  const ate = sp.ate || hoje;

  const veDeTodos = await podeVerDeTodos();
  const apontamentos = await listarApontamentos({ de, ate, usuarioId: veDeTodos ? sp.usuarioId : undefined });
  const sessao = await sessaoAtual();
  const colaboradores = await listarColaboradores();

  const supabase = await createServerSupabase();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social")
    .limit(300);
  const { data: tarefas } = await supabase
    .from("tarefa")
    .select("id, titulo")
    .in("status", ["aberta", "em_andamento"])
    .order("criado_em", { ascending: false })
    .limit(100);

  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Timesheet" subtitulo="Apontamento de horas por cliente e tarefa" />
      <PainelTimesheet
        apontamentos={apontamentos}
        sessao={sessao}
        clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
        tarefas={(tarefas ?? []).map((t) => ({ id: t.id as string, nome: t.titulo as string }))}
        colaboradores={colaboradores}
        hoje={hoje}
        filtros={{ de, ate, usuarioId: sp.usuarioId }}
        veDeTodos={veDeTodos}
      />
    </Container>
  );
}
