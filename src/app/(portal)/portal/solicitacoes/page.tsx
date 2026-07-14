import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { rotuloCategoria, rotuloStatus, type SolicitacaoCategoria, type SolicitacaoStatus } from "@/lib/solicitacoes/solicitacao";
import { NovaSolicitacao } from "./NovaSolicitacao";

export const metadata = { title: "Solicitações" };

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default async function PortalSolicitacoesPage() {
  const supabase = await createServerSupabase();
  // A RLS só devolve as solicitações do próprio cliente.
  const { data } = await supabase
    .from("solicitacao")
    .select("id, numero, assunto, categoria, status, prazo")
    .order("criado_em", { ascending: false });
  const lista = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-texto">Solicitações</h1>
      <NovaSolicitacao />
      {lista.length === 0 ? (
        <p className="text-sm text-cinza">Você ainda não abriu nenhuma solicitação.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((s) => (
            <li key={s.id as string}>
              <Link href={`/portal/solicitacoes/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm hover:bg-creme">
                <span className="font-medium text-texto">
                  <span className="font-mono text-xs text-cinza">#{String(s.numero)}</span> {s.assunto as string}
                </span>
                <span className="flex items-center gap-3 text-xs text-cinza">
                  <span>{rotuloCategoria(s.categoria as SolicitacaoCategoria)}</span>
                  <span>{rotuloStatus(s.status as SolicitacaoStatus)}</span>
                  <span>prazo {dataBR(s.prazo as string | null)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
