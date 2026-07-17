import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { RelatorioConformidade } from "./RelatorioConformidade";
import { relatorioConformidade } from "../conformidade-actions";

export default async function ConformidadePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dados = await relatorioConformidade(ano, mes);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Conformidade" subtitulo="Entregas por competência — no prazo, com atraso, pendentes" />
      <RelatorioConformidade ano={ano} mes={mes} dados={dados} />
    </Container>
  );
}
