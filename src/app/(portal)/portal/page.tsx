import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

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

  return (
    <div className="space-y-4">
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
