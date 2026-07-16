import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { progressoProcesso } from "@/lib/legalizacao/processo";
import {
  rotuloTipo,
  etapaConcluida,
  type LegTipo,
  type LegOrgao,
  type LegEtapaStatus,
  type LegProcStatus,
} from "@/lib/legalizacao/tipos";
import { PainelLegalizacao } from "./PainelLegalizacao";

const STATUS = new Set<LegProcStatus>(["em_andamento", "concluido", "cancelado"]);
const ORGAOS = new Set<LegOrgao>(["junta", "receita", "prefeitura", "sefaz", "bombeiros", "vigilancia", "outro"]);

export const metadata = { title: "Legalização" };

export default async function LegalizacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; orgao?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarLegalizacao(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const status =
    sp.status && (sp.status === "todos" || STATUS.has(sp.status as LegProcStatus)) ? sp.status : "em_andamento";
  const orgao = (sp.orgao && ORGAOS.has(sp.orgao as LegOrgao) ? sp.orgao : "") as LegOrgao | "";

  const supabase = await createServerSupabase();
  let query = supabase
    .from("legalizacao_processo")
    .select("id, cliente_id, tipo, titulo, status")
    .order("criado_em", { ascending: false })
    .limit(300);
  if (status !== "todos") query = query.eq("status", status);
  const { data: procs } = await query;
  const rows = procs ?? [];
  const ids = rows.map((p) => p.id as string);
  const cliIds = [...new Set(rows.map((p) => p.cliente_id as string))];

  const { data: etapas } = ids.length
    ? await supabase.from("legalizacao_etapa").select("processo_id, status, prazo, orgao").in("processo_id", ids)
    : { data: [] };
  const { data: clientes } = cliIds.length
    ? await supabase.from("clientes").select("id, razao_social").in("id", cliIds)
    : { data: [] };
  const nomeCli = new Map<string, string>(
    (clientes ?? []).map((c) => [c.id as string, (c.razao_social as string) ?? "—"]),
  );

  type Et = { status: LegEtapaStatus; prazo: string | null; orgao: LegOrgao };
  const porProc = new Map<string, Et[]>();
  for (const e of etapas ?? []) {
    const a = porProc.get(e.processo_id as string) ?? [];
    a.push({
      status: e.status as LegEtapaStatus,
      prazo: (e.prazo as string | null) ?? null,
      orgao: e.orgao as LegOrgao,
    });
    porProc.set(e.processo_id as string, a);
  }

  const linhas = rows
    .map((p) => {
      const ets = porProc.get(p.id as string) ?? [];
      const pr = progressoProcesso(ets);
      const orgaosPendentes = new Set(ets.filter((e) => !etapaConcluida(e.status)).map((e) => e.orgao));
      return {
        id: p.id as string,
        cliente: nomeCli.get(p.cliente_id as string) ?? "—",
        titulo: (p.titulo as string) || rotuloTipo(p.tipo as LegTipo),
        status: p.status as string,
        pct: pr.pct,
        proximoPrazo: pr.proximoPrazo,
        orgaosPendentes: [...orgaosPendentes],
      };
    })
    .filter((l) => orgao === "" || l.orgaosPendentes.includes(orgao as LegOrgao));

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Legalização / Societário" subtitulo="Processos societários e de legalização por órgão" />
      <PainelLegalizacao linhas={linhas} filtros={{ status, orgao }} />
    </main>
  );
}
