import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubNav } from "@/components/ui/SubNav";
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
    <main className="mx-auto max-w-full space-y-5 p-4">
      <PageHeader
        titulo="Obrigações"
        subtitulo="Calendário de obrigações por competência (o vencimento aparece em cada linha)"
      />
      {/* Conformidade e Riscos só eram alcançáveis por um botão dentro do calendário — 3 cliques
          a partir de um menu chamado "Clientes". Agora a seção declara suas telas. */}
      <SubNav
        itens={[
          { href: "/obrigacoes", label: "Calendário" },
          { href: "/obrigacoes/riscos", label: "Riscos" },
          { href: "/obrigacoes/escalonamento", label: "Escalonamento" },
          { href: "/obrigacoes/conformidade", label: "Conformidade" },
        ]}
      />
      <Calendario ano={ano} mes={mes} instancias={instancias} podeGerar={podeGerenciarMatriz(perfil.papel)} />
    </main>
  );
}
