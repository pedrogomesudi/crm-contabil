import { Container } from "@/components/ui/Container";
import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import { estaVencida, type SolicInternaStatus } from "@/lib/solicitacoes/interna";
import { formatarData } from "@/lib/format";
import { Atendimento } from "./Atendimento";
import { Voltar } from "@/components/ui/Voltar";

export default async function InternaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");

  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from("solicitacao_interna")
    .select(
      "id, numero, origem, destino, assunto, status, prazo, cliente_id, responsavel_id, tarefa_id, clientes(razao_social)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();

  const { data: msgs } = await supabase
    .from("solicitacao_interna_mensagem")
    .select("id, corpo, autor_id, criado_em")
    .eq("solicitacao_id", id)
    .order("criado_em");

  const colaboradores = await listarColaboradores();
  const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));

  const mensagens = (msgs ?? []).map((m) => {
    const autorId = (m.autor_id as string | null) ?? "";
    return {
      id: m.id as string,
      corpo: m.corpo as string,
      criadoEm: m.criado_em as string,
      autor: nomes.get(autorId) ?? "—",
      minha: autorId === perfil.id,
    };
  });

  const cl = Array.isArray(s.clientes) ? s.clientes[0] : s.clientes;
  const clienteNome = (cl as { razao_social?: string } | null)?.razao_social ?? null;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const vencida = estaVencida(s.status as SolicInternaStatus, (s.prazo as string | null) ?? null, hoje);

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/solicitacoes/internas" label="Solicitações internas" />
      <PageHeader
        titulo={`#${String(s.numero)} — ${s.assunto as string}`}
        subtitulo={`${rotuloDepartamento(s.origem as Departamento)} → ${rotuloDepartamento(s.destino as Departamento)}${clienteNome ? ` · ${clienteNome}` : ""} · prazo ${formatarData(s.prazo as string | null)}${vencida ? " (vencido)" : ""}`}
      />
      <Atendimento
        id={id}
        status={s.status as SolicInternaStatus}
        responsavelId={(s.responsavel_id as string | null) ?? ""}
        tarefaId={(s.tarefa_id as string | null) ?? null}
        colaboradores={colaboradores}
        mensagens={mensagens}
      />
    </Container>
  );
}
