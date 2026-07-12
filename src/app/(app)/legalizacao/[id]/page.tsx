import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { progressoProcesso } from "@/lib/legalizacao/processo";
import { rotuloTipo, type LegTipo, type LegOrgao, type LegEtapaStatus, type LegProcStatus } from "@/lib/legalizacao/tipos";
import { EtapaLinha } from "./EtapaLinha";
import { TermoAcervo } from "./TermoAcervo";
import { AcoesProcesso } from "./AcoesProcesso";

const ROT_PROC: Record<string, string> = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };

export default async function ProcessoLegalizacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase
    .from("legalizacao_processo")
    .select("id, cliente_id, tipo, titulo, status, data_inicio")
    .eq("id", id)
    .maybeSingle();
  if (!proc) notFound();
  const { data: cli } = await supabase.from("clientes").select("razao_social").eq("id", proc.cliente_id as string).maybeSingle();
  const { data: etapas } = await supabase
    .from("legalizacao_etapa")
    .select("id, ordem, titulo, descricao, orgao, orgao_outro, prazo, status, protocolo, protocolo_em, anexo_obrigatorio, anexo_path, avisar_cliente, cliente_avisado_em, observacao")
    .eq("processo_id", id)
    .order("ordem");

  const admin = createAdminSupabase();
  const linhas = await Promise.all((etapas ?? []).map(async (e) => {
    let anexoUrl: string | null = null;
    if (e.anexo_path) {
      const { data: signed } = await admin.storage.from("documentos").createSignedUrl(e.anexo_path as string, 60);
      anexoUrl = signed?.signedUrl ?? null;
    }
    return {
      id: e.id as string,
      ordem: e.ordem as number,
      titulo: e.titulo as string,
      descricao: (e.descricao as string | null) ?? null,
      orgao: e.orgao as LegOrgao,
      orgaoOutro: (e.orgao_outro as string | null) ?? null,
      prazo: (e.prazo as string | null) ?? null,
      status: e.status as LegEtapaStatus,
      protocolo: (e.protocolo as string | null) ?? null,
      protocoloEm: (e.protocolo_em as string | null) ?? null,
      anexoObrigatorio: e.anexo_obrigatorio as boolean,
      anexoUrl,
      avisarCliente: e.avisar_cliente as boolean,
      clienteAvisadoEm: (e.cliente_avisado_em as string | null) ?? null,
      observacao: (e.observacao as string | null) ?? null,
    };
  }));

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const prog = progressoProcesso(linhas.map((l) => ({ status: l.status, prazo: l.prazo })));
  const status = proc.status as LegProcStatus;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <Link href={`/clientes/${proc.cliente_id}`} className="text-sm text-verde underline">← {(cli?.razao_social as string) ?? "Cliente"}</Link>
      <PageHeader
        titulo={(proc.titulo as string) || rotuloTipo(proc.tipo as LegTipo)}
        subtitulo={`${ROT_PROC[status] ?? status} · ${prog.pct}% · ${prog.concluidas}/${prog.total} etapas`}
        acoes={<AcoesProcesso id={id} status={status} />}
      />
      {String(proc.tipo).startsWith("transferencia_") && (
        <TermoAcervo processoId={id} hoje={hoje} responsavelPadrao={perfil.nome} />
      )}
      <div className="space-y-3">
        {linhas.map((l) => (
          <EtapaLinha key={l.id} etapa={l} hoje={hoje} />
        ))}
      </div>
    </main>
  );
}
