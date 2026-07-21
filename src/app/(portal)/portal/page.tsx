import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { npsDevido } from "@/lib/nps/devido";
import { CardNps } from "./CardNps";

export const metadata = { title: "Portal do cliente" };

// A RLS do portal só devolve as linhas do próprio cliente — as contagens abaixo já
// são, por construção, só dele.
export default async function PortalInicioPage() {
  const supabase = await createServerSupabase();
  const [docs, notas, guias, boletos] = await Promise.all([
    supabase.from("documentos").select("id", { count: "exact", head: true }),
    supabase.from("nfse").select("id", { count: "exact", head: true }),
    supabase.from("obrigacao_instancia").select("id", { count: "exact", head: true }),
    supabase.from("boleto").select("id", { count: "exact", head: true }),
  ]);

  const cards = [
    { href: "/portal/documentos", label: "Documentos", n: docs.count ?? 0 },
    { href: "/portal/notas", label: "Notas fiscais", n: notas.count ?? 0 },
    { href: "/portal/guias", label: "Guias", n: guias.count ?? 0 },
    { href: "/portal/boletos", label: "Boletos", n: boletos.count ?? 0 },
  ];

  // NPS lazy: a config é legível por qualquer autenticado; a RLS de nps_resposta já
  // restringe a última resposta ao próprio cliente.
  const [cfgRes, ultimaRes] = await Promise.all([
    supabase
      .from("escritorio_config")
      .select("nps_ativo, nps_periodicidade_dias, nps_pergunta")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("nps_resposta").select("criada_em").order("criada_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const npsAberto = npsDevido({
    ativo: cfgRes.data?.nps_ativo ?? false,
    periodicidadeDias: cfgRes.data?.nps_periodicidade_dias ?? 90,
    ultimaRespostaIso: (ultimaRes.data?.criada_em as string | null) ?? null,
    hojeIso: hoje,
  });
  const npsPergunta =
    (cfgRes.data?.nps_pergunta as string | null) || "De 0 a 10, quanto você recomendaria nosso escritório a um colega?";

  return (
    <div className="space-y-4">
      {npsAberto && <CardNps pergunta={npsPergunta} />}
      <h1 className="font-display text-xl font-bold text-texto">Bem-vindo</h1>
      <p className="text-sm text-cinza">
        Aqui você consulta e baixa os seus documentos, notas fiscais, guias e boletos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-2xl border border-linha bg-white p-4 hover:bg-creme">
            <p className="text-sm text-cinza">{c.label}</p>
            <p className="font-display text-2xl font-bold tabular-nums text-texto">{c.n}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
