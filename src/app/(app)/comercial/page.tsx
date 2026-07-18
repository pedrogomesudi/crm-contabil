import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubNav } from "@/components/ui/SubNav";
import { QuadroComercial } from "./QuadroComercial";
import { listarOportunidades, listarEtapas } from "./actions";

export default async function ComercialPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const [oportunidades, etapas] = await Promise.all([listarOportunidades(), listarEtapas()]);
  const supabase = await createServerSupabase();
  const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
  const usuarios = (us as { id: string; nome: string }[] | null) ?? [];
  const agora = new Date().toISOString();
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Comercial" subtitulo="Funil de oportunidades" />
      <SubNav
        itens={[
          { href: "/comercial/propostas", label: "Propostas" },
          { href: "/comercial/metricas", label: "Métricas do funil" },
        ]}
      />
      <QuadroComercial oportunidades={oportunidades} usuarios={usuarios} etapas={etapas} agora={agora} />
    </Container>
  );
}
