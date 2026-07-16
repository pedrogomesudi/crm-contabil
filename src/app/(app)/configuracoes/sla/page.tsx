import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSlaDepto } from "./FormSlaDepto";

export const metadata = { title: "SLA por departamento" };

export default async function SlaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("departamento_sla").select("departamento, dias");
  const slas: Record<string, number> = {};
  for (const s of data ?? []) slas[s.departamento as string] = s.dias as number;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <Link href="/configuracoes" className="text-sm text-verde underline">
        ← Configurações
      </Link>
      <PageHeader titulo="SLA por departamento" subtitulo="Prazo-alvo das solicitações internas, por destino" />
      <FormSlaDepto slas={slas} />
    </main>
  );
}
