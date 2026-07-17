import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeAtenderSolicitacoes } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { rotuloCategoria, type SolicitacaoCategoria, type SolicitacaoStatus } from "@/lib/solicitacoes/solicitacao";
import { Atendimento } from "./Atendimento";

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default async function SolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtenderSolicitacoes(perfil.papel)) redirect("/");

  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from("solicitacao")
    .select("id, numero, assunto, categoria, status, prazo, cliente_id, responsavel_id, tarefa_id")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();

  const { data: msgs } = await supabase
    .from("solicitacao_mensagem")
    .select("id, corpo, autor_id, criado_em")
    .eq("solicitacao_id", id)
    .order("criado_em");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social")
    .eq("id", s.cliente_id as string)
    .maybeSingle();

  const colaboradores = await listarColaboradores();
  const idsEquipe = new Set(colaboradores.map((c) => c.id));
  const nomeEquipe = new Map(colaboradores.map((c) => [c.id, c.nome]));

  const mensagens = (msgs ?? []).map((m) => {
    const autor = m.autor_id as string | null;
    const daEquipe = autor !== null && idsEquipe.has(autor);
    return {
      id: m.id as string,
      corpo: m.corpo as string,
      criadoEm: m.criado_em as string,
      daEquipe,
      autor: daEquipe ? (nomeEquipe.get(autor as string) ?? "Escritório") : "Cliente",
    };
  });

  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <Link href="/solicitacoes" className="text-sm text-verde underline">
        ← Solicitações
      </Link>
      <PageHeader
        titulo={`#${String(s.numero)} — ${s.assunto as string}`}
        subtitulo={`${(cliente?.razao_social as string) ?? "—"} · ${rotuloCategoria(s.categoria as SolicitacaoCategoria)} · prazo ${dataBR(s.prazo as string | null)}`}
      />
      <Atendimento
        solicitacaoId={id}
        status={s.status as SolicitacaoStatus}
        responsavelId={(s.responsavel_id as string | null) ?? ""}
        tarefaId={(s.tarefa_id as string | null) ?? null}
        colaboradores={colaboradores}
        mensagens={mensagens}
      />
    </main>
  );
}
