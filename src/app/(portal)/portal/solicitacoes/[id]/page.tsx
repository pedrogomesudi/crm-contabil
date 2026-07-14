import { notFound } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { rotuloCategoria, rotuloStatus, type SolicitacaoCategoria, type SolicitacaoStatus } from "@/lib/solicitacoes/solicitacao";
import { Thread } from "./Thread";

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default async function PortalSolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  const supabase = await createServerSupabase();
  // A RLS garante que só a solicitação do próprio cliente é devolvida.
  const { data: s } = await supabase
    .from("solicitacao")
    .select("id, numero, assunto, categoria, status, prazo")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();

  const { data: msgs } = await supabase
    .from("solicitacao_mensagem")
    .select("id, corpo, autor_id, criado_em")
    .eq("solicitacao_id", id)
    .order("criado_em");

  const mensagens = (msgs ?? []).map((m) => ({
    id: m.id as string,
    corpo: m.corpo as string,
    criadoEm: m.criado_em as string,
    minha: (m.autor_id as string | null) === perfil?.id, // a autoria é forçada pelo gatilho
  }));

  return (
    <div className="space-y-4">
      <Link href="/portal/solicitacoes" className="text-sm text-verde underline">← Solicitações</Link>
      <div>
        <h1 className="font-display text-xl font-bold text-texto">
          <span className="font-mono text-sm text-cinza">#{String(s.numero)}</span> {s.assunto as string}
        </h1>
        <p className="text-xs text-cinza">
          {rotuloCategoria(s.categoria as SolicitacaoCategoria)} · {rotuloStatus(s.status as SolicitacaoStatus)} · prazo {dataBR(s.prazo as string | null)}
        </p>
      </div>
      <Thread solicitacaoId={id} mensagens={mensagens} />
    </div>
  );
}
