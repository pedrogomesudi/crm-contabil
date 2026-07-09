import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Extrato } from "./Extrato";
import { listarCategoriasFiltro, listarLancamentos } from "./extrato-actions";

export default async function ExtratoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const inicio = `${hoje.slice(0, 7)}-01`;
  const fim = `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  const [categorias, lancamentosIni] = await Promise.all([listarCategoriasFiltro(), listarLancamentos(inicio, fim, "todos", null)]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader titulo="Extrato / movimentações" subtitulo="Lançamentos e baixas, com export CSV" />
      <Extrato categorias={categorias} inicio={inicio} fim={fim} lancamentosIni={lancamentosIni} />
    </main>
  );
}
