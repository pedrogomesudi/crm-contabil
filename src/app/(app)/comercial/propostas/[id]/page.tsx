import { Container } from "@/components/ui/Container";
import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorProposta } from "./EditorProposta";
import { obterProposta } from "../../propostas-actions";
import { carregarPrecificacao } from "../../../configuracoes/precificacao/actions";
import { paraConfigPreco } from "@/lib/comercial/precificacao";
import { carregarEstadoContrato } from "./contrato-status";
import { ContratoHonorarios } from "./ContratoHonorarios";
import { passosContrato } from "@/lib/comercial/contratoProposta";
import { carregarAgendaFollowup } from "./followup-status";
import { FollowupProposta } from "./FollowupProposta";

export default async function EditarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const responsavelPadrao = { nome: perfil.nome, email: user?.email ?? "" };
  const view = await carregarPrecificacao();
  const config = paraConfigPreco(view);
  const complexidades = view.complexidades.map((c) => ({ id: c.id, nome: c.nome }));
  const servicos = view.servicos
    .filter((s) => s.ativo)
    .map((s) => ({
      id: s.id,
      nome: s.nome,
      valor: s.valor,
      recorrencia: (s.recorrencia === "mensal" ? "mensal" : "unico") as "mensal" | "unico",
    }));
  const propostaAceita = proposta.status === "aceita";
  const estado = await carregarEstadoContrato(proposta.oportunidadeId, propostaAceita);
  const passos = passosContrato(estado);
  const concluido = passos.every((p) => p.situacao === "feito");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const agenda = await carregarAgendaFollowup(proposta.id, hoje);
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <PageHeader titulo={`Proposta nº ${proposta.numero}`} subtitulo={proposta.prospectNome} />
      <EditorProposta
        proposta={proposta}
        responsavelPadrao={responsavelPadrao}
        config={config}
        complexidades={complexidades}
        servicos={servicos}
      />
      <ContratoHonorarios passos={passos} propostaAceita={propostaAceita} concluido={concluido} />
      <FollowupProposta enviada={agenda.enviada} passos={agenda.passos} />
    </Container>
  );
}
