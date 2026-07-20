import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { controleCls } from "@/components/ui/Campo";
import { Conciliacao } from "./Conciliacao";
import { listarContas, listarMovimentos, carregarTolerancia, salvarTolerancia } from "./actions";
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
  const tolerancia = await carregarTolerancia();
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Conciliação bancária" subtitulo="Importe o extrato (OFX/CSV) e veja as movimentações" />
      {perfil.papel === "admin" && (
        <form action={salvarTolerancia} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            Tolerância de valor (R$)
            <input
              name="tolerancia"
              type="number"
              step="0.01"
              min="0"
              defaultValue={tolerancia}
              className={controleCls("compacto")}
            />
          </label>
          <button type="submit" className="rounded-lg border border-linha px-3 py-1.5 text-cinza hover:bg-creme">
            Salvar
          </button>
          <span className="text-xs text-cinza">margem para casar movimentos (arredondamento/tarifas)</span>
        </form>
      )}
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
    </Container>
  );
}
