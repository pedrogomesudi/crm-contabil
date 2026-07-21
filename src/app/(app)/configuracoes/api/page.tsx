import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { GestaoChaves } from "./GestaoChaves";
import { listarApiKeys } from "./actions";

export const metadata = { title: "API pública" };

export default async function ApiConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const chaves = await listarApiKeys();
  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="API pública" subtitulo="Chaves de acesso para integrações externas (/api/v1)" />
      <GestaoChaves chaves={chaves} />
    </Container>
  );
}
