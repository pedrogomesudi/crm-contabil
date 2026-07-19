import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { listarVencidos } from "../actions";
import { TabelaRetencao } from "@/components/documentos/TabelaRetencao";

export const metadata = { title: "Retenção de documentos" };

export default async function RetencaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/documentos");
  const docs = await listarVencidos();
  return (
    <Container className="space-y-5 p-4">
      <Voltar href="/documentos" label="Documentos" />
      <PageHeader
        titulo="Retenção — documentos vencidos"
        subtitulo="Revise e expurgue os documentos que passaram do prazo de retenção"
      />
      <TabelaRetencao docs={docs} />
    </Container>
  );
}
