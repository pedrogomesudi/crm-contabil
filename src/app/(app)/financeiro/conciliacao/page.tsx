import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Conciliacao } from "./Conciliacao";
import { listarContas, listarMovimentos } from "./actions";
import {
  listarCategoriasLancamento,
  listarClientesLancamento,
  listarFornecedoresLancamento,
} from "./conciliar-actions";

export default async function ConciliacaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const inicio = `${hoje.slice(0, 7)}-01`;
  const ultimo = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0)).getUTCDate();
  const fim = `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  const [contas, categorias, clientes, fornecedores] = await Promise.all([
    listarContas(),
    listarCategoriasLancamento(),
    listarClientesLancamento(),
    listarFornecedoresLancamento(),
  ]);
  const contaInicial = contas[0]?.id ?? "";
  const movimentosIni = contaInicial ? await listarMovimentos(contaInicial, inicio, fim, "") : [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Conciliação bancária" subtitulo="Importe o extrato (OFX/CSV) e veja as movimentações" />
      {contas.length === 0 ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">
          Cadastre uma conta bancária primeiro (Financeiro → Cadastros → Contas).
        </p>
      ) : (
        <Conciliacao
          contas={contas}
          inicio={inicio}
          fim={fim}
          contaInicial={contaInicial}
          movimentosIni={movimentosIni}
          categorias={categorias}
          clientes={clientes}
          fornecedores={fornecedores}
        />
      )}
    </main>
  );
}
