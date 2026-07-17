import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarCustos } from "./actions";
import { FormCustos } from "./FormCustos";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "Custo por colaborador" };

export default async function CustosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const custos = await listarCustos();
  const colaboradores = await listarColaboradores();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader
        titulo="Custo por colaborador"
        subtitulo="Base do custo de atendimento — visível apenas para o admin"
      />
      <FormCustos custos={custos} colaboradores={colaboradores} hoje={hoje} />
    </Container>
  );
}
