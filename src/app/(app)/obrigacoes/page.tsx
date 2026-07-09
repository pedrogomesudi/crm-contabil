import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Calendario } from "./Calendario";
import { listarInstancias } from "./actions";

export default async function ObrigacoesPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const instancias = await listarInstancias(ano, mes);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Obrigações" subtitulo="Calendário de obrigações a vencer no mês" />
      <Calendario ano={ano} mes={mes} instancias={instancias} podeGerar={podeGerenciarMatriz(perfil.papel)} />
    </main>
  );
}
