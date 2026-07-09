import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
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
  return (
    <main className="min-h-screen bg-white p-4">
      <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between print:hidden">
        <Link href={`/comercial/propostas/${id}`} className="text-sm text-verde underline">← Editar</Link>
        <ImprimirBtn />
      </div>
      <DocumentoProposta proposta={proposta} hoje={hoje} />
    </main>
  );
}
