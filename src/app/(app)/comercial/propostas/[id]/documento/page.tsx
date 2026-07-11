import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatarEnderecoLinha } from "@/lib/comercial/proposta-template";
import { urlLogoAtual } from "@/app/(app)/configuracoes/marca/actions";
import { DocumentoProposta } from "./DocumentoProposta";
import { ImprimirBtn } from "./ImprimirBtn";
import { obterProposta } from "../../../propostas-actions";

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("escritorio_config").select("nome, cnpj, endereco").eq("id", 1).maybeSingle();
  const marca = {
    nome: (cfg?.nome as string | null) ?? null,
    cnpj: (cfg?.cnpj as string | null) ?? null,
    enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null),
  };
  const logoUrl = await urlLogoAtual();
  return (
    <main className="min-h-screen bg-white p-4">
      <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between print:hidden">
        <Link href={`/comercial/propostas/${id}`} className="text-sm text-verde underline">← Editar</Link>
        <ImprimirBtn />
      </div>
      <DocumentoProposta proposta={proposta} hoje={hoje} marca={marca} logoUrl={logoUrl} />
    </main>
  );
}
