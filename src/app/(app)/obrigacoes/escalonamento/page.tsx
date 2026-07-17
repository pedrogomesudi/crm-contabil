import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EscalonamentoView } from "./EscalonamentoView";
import { listarEscalonamento, escalonamentoAtivo } from "../escalonamento-actions";

export default async function EscalonamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const [itens, ativo] = await Promise.all([listarEscalonamento(), escalonamentoAtivo()]);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Escalonamento" subtitulo="Obrigações atrasadas que subiram para você (líder/sócio)" />
      <EscalonamentoView itens={itens} ativo={ativo} />
    </Container>
  );
}
