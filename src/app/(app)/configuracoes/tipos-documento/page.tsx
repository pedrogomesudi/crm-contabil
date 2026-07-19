import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { TiposDocumentoLista } from "./TiposDocumentoLista";
import { listarTiposDocumento } from "./actions";

export const metadata = { title: "Tipos de documento" };

export default async function TiposDocumentoConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const [tipos, { data: cfg }] = await Promise.all([
    listarTiposDocumento(),
    supabase.from("escritorio_config").select("retencao_meses").eq("id", 1).maybeSingle(),
  ]);
  const global = (cfg?.retencao_meses as number | null) ?? 60;
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Tipos de documento" subtitulo="Catálogo do GED — tipo, departamento e retenção" />
      <TiposDocumentoLista tipos={tipos} global={global} />
    </Container>
  );
}
