import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeAtenderSolicitacoes } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  SOLICITACAO_CATEGORIAS,
  SOLICITACAO_STATUS,
  contaPrazo,
  rotuloCategoria,
  rotuloStatus,
  type SolicitacaoCategoria,
  type SolicitacaoStatus,
} from "@/lib/solicitacoes/solicitacao";

export const metadata = { title: "Solicitações" };

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; categoria?: string; vencidas?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtenderSolicitacoes(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const supabase = await createServerSupabase();
  let q = supabase
    .from("solicitacao")
    .select("id, numero, assunto, categoria, status, prazo, cliente_id")
    .order("criado_em", { ascending: false })
    .limit(300);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.categoria) q = q.eq("categoria", sp.categoria);
  const { data } = await q;
  let lista = data ?? [];
  if (sp.vencidas === "1") {
    lista = lista.filter(
      (s) =>
        contaPrazo(s.status as SolicitacaoStatus) && (s.prazo as string | null) !== null && (s.prazo as string) < hoje,
    );
  }

  const cliIds = [...new Set(lista.map((s) => s.cliente_id as string))];
  const { data: clientes } = cliIds.length
    ? await supabase.from("clientes").select("id, razao_social").in("id", cliIds)
    : { data: [] };
  const nomeCli = new Map<string, string>(
    (clientes ?? []).map((c) => [c.id as string, (c.razao_social as string) ?? "—"]),
  );

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/solicitacoes?${s}` : "/solicitacoes";
  };

  const chip = (ativo: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs ${ativo ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza"}`;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <div className="flex gap-1 text-sm">
        <span className="rounded-lg border border-verde bg-verde/10 px-3 py-1.5 text-verde">Do cliente</span>
        <Link href="/solicitacoes/internas" className="rounded-lg border border-linha px-3 py-1.5 text-cinza">
          Internas
        </Link>
      </div>
      <PageHeader titulo="Solicitações" subtitulo="Pedidos abertos pelos clientes no portal" />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={link({ status: undefined })} className={chip(!sp.status)}>
          Todos os status
        </Link>
        {SOLICITACAO_STATUS.map((s) => (
          <Link key={s.valor} href={link({ status: s.valor })} className={chip(sp.status === s.valor)}>
            {s.rotulo}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={link({ categoria: undefined })} className={chip(!sp.categoria)}>
          Todas as categorias
        </Link>
        {SOLICITACAO_CATEGORIAS.map((c) => (
          <Link key={c.valor} href={link({ categoria: c.valor })} className={chip(sp.categoria === c.valor)}>
            {c.rotulo}
          </Link>
        ))}
        <Link href={link({ vencidas: sp.vencidas === "1" ? undefined : "1" })} className={chip(sp.vencidas === "1")}>
          SLA vencido
        </Link>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma solicitação com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((s) => {
            const prazo = s.prazo as string | null;
            const vencida = contaPrazo(s.status as SolicitacaoStatus) && prazo !== null && prazo < hoje;
            return (
              <li key={s.id as string}>
                <Link
                  href={`/solicitacoes/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm hover:bg-creme"
                >
                  <span className="text-texto">
                    <span className="font-mono text-xs text-cinza">#{String(s.numero)}</span>{" "}
                    <span className="font-medium">{s.assunto as string}</span>
                    <span className="block text-xs text-cinza">{nomeCli.get(s.cliente_id as string) ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-cinza">
                    <span>{rotuloCategoria(s.categoria as SolicitacaoCategoria)}</span>
                    <span>{rotuloStatus(s.status as SolicitacaoStatus)}</span>
                    <span className={vencida ? "font-semibold text-negativo" : ""}>prazo {dataBR(prazo)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
