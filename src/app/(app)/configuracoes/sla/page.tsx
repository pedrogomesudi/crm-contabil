import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSlaDepto } from "./FormSlaDepto";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "SLA por departamento" };

export default async function SlaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("departamento_sla").select("departamento, dias");
  const slas: Record<string, number> = {};
  for (const s of data ?? []) slas[s.departamento as string] = s.dias as number;

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="SLA por departamento" subtitulo="Prazo-alvo das solicitações internas, por destino" />
      <FormSlaDepto slas={slas} />
    </Container>
  );
}
