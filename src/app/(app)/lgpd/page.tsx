import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTratamentos, listarSolicitacoes } from "./actions";
import { PainelLgpd } from "./PainelLgpd";

export const metadata = { title: "LGPD" };

export default async function LgpdPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const tratamentos = await listarTratamentos();
  const solicitacoes = await listarSolicitacoes();
  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("retencao_meses, lgpd_encarregado")
    .eq("id", 1)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <Link href="/configuracoes" className="text-sm text-verde underline">
        ← Configurações
      </Link>
      <PageHeader titulo="LGPD" subtitulo="Tratamentos, consentimento, retenção e direitos do titular" />
      <PainelLgpd
        tratamentos={tratamentos as never}
        solicitacoes={solicitacoes}
        retencaoMeses={(cfg?.retencao_meses as number | null) ?? 60}
        encarregado={(cfg?.lgpd_encarregado as string | null) ?? ""}
      />
    </main>
  );
}
