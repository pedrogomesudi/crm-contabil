import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatarEnderecoLinha } from "@/lib/comercial/proposta-template";
import { urlLogoAtual } from "@/app/(app)/configuracoes/marca/actions";
import { DocumentoProposta } from "./DocumentoProposta";
import { ImprimirBtn } from "./ImprimirBtn";
import { obterProposta } from "../../../propostas-actions";
import { Voltar } from "@/components/ui/Voltar";

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, endereco")
    .eq("id", 1)
    .maybeSingle();
  const marca = {
    nome: (cfg?.nome as string | null) ?? null,
    cnpj: (cfg?.cnpj as string | null) ?? null,
    enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null),
  };
  const logoUrl = await urlLogoAtual();
  return (
    // <div>, não <Container>: esta é a folha impressa da proposta, não uma tela com régua.
    // O branco cobrindo a viewport é de propósito (o creme não vai para o papel), e a largura
    // do documento é a do <div> interno. Um Container aqui imporia mx-auto + max-w e mudaria
    // o layout. O que muda é só o landmark: o <main> do layout continua sendo o único.
    <div className="min-h-screen bg-white p-4">
      <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between print:hidden">
        <Voltar href={`/comercial/propostas/${id}`} label="Editar" />
        <ImprimirBtn />
      </div>
      <DocumentoProposta proposta={proposta} hoje={hoje} marca={marca} logoUrl={logoUrl} />
    </div>
  );
}
