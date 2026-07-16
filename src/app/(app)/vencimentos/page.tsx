import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import type { Severidade } from "@/lib/vencimentos/alerta";
import { listarVencimentos } from "./actions";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

export const metadata = { title: "Vencimentos" };

const CLASSE: Record<Severidade, string> = {
  vencido: "bg-negativo text-white",
  critico: "bg-negativo/15 text-negativo",
  alerta: "bg-amber-100 text-amber-800",
  aviso: "bg-slate-100 text-cinza",
  ok: "bg-slate-100 text-cinza",
};
const ROTULO: Record<Severidade, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  alerta: "Alerta",
  aviso: "Aviso",
  ok: "Ok",
};

export default async function VencimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ sev?: string; origem?: string; q?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) redirect("/login");
  if (!podeGerenciarVencimentos(perfil.papel)) redirect("/");

  const { sev = "", origem = "", q = "" } = await searchParams;
  // Os cartões sempre refletem o total (o filtro é da tabela, não do resumo).
  const { resumo, itens } = await listarVencimentos();
  const busca = q.trim().toLowerCase().slice(0, 60);
  const visiveis = itens.filter(
    (i) =>
      (!sev || i.severidade === sev) &&
      (!origem || i.origem === origem) &&
      (!busca || i.clienteNome.toLowerCase().includes(busca)),
  );

  const cartoes = [
    { rotulo: "Vencidos", valor: resumo.vencidos },
    { rotulo: "≤ 15 dias", valor: resumo.criticos },
    { rotulo: "≤ 30 dias", valor: resumo.alertas },
    { rotulo: "≤ 60 dias", valor: resumo.avisos },
  ];

  // Sobre `visiveis`, não `itens`: o CSV antigo exportava o dataset bruto, então quem
  // filtrava por "Vencido" via 3 linhas na tela e recebia as 200 no arquivo.
  const filtros = [sev && ROTULO[sev as Severidade], origem, q].filter(Boolean).join(" · ");
  const relatorio: RelatorioExportavel = {
    titulo: "Vencimentos",
    subtitulo: filtros || "Próximos 60 dias",
    colunas: [
      { chave: "clienteNome", rotulo: "Cliente", formato: "texto" },
      { chave: "titulo", rotulo: "Item", formato: "texto" },
      { chave: "detalhe", rotulo: "Detalhe", formato: "texto" },
      { chave: "validade", rotulo: "Validade", formato: "data" },
      { chave: "diasRestantes", rotulo: "Dias restantes", formato: "numero" },
      { chave: "situacao", rotulo: "Situação", formato: "texto" },
    ],
    linhas: visiveis.map((i) => ({ ...i, situacao: ROTULO[i.severidade] })),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-texto">Vencimentos</h1>
        <BotaoExportar relatorio={relatorio} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-linha bg-white p-3">
            <p className="text-xs text-cinza">{c.rotulo}</p>
            <p className="text-2xl font-semibold text-texto">{c.valor}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          maxLength={60}
          className="rounded-lg border border-linha px-3 py-2 text-sm text-texto"
        />
        <select
          name="sev"
          defaultValue={sev}
          aria-label="Filtrar por situação"
          className="rounded-lg border border-linha px-2 text-sm text-texto"
        >
          <option value="">Todas as situações</option>
          <option value="vencido">Vencido</option>
          <option value="critico">Crítico (≤ 15)</option>
          <option value="alerta">Alerta (≤ 30)</option>
          <option value="aviso">Aviso (≤ 60)</option>
        </select>
        <select
          name="origem"
          defaultValue={origem}
          aria-label="Filtrar por tipo"
          className="rounded-lg border border-linha px-2 text-sm text-texto"
        >
          <option value="">Todos os tipos</option>
          <option value="certificado">Certificado</option>
          <option value="procuracao">Procuração</option>
          <option value="nfse">Certificado da NFS-e</option>
        </select>
        <button className="rounded-lg border border-linha px-3 text-sm text-cinza">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-linha bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Certificados e procurações a vencer</caption>
          <thead className="bg-creme text-left text-cinza">
            <tr>
              <th className="p-2 font-medium">Cliente</th>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 font-medium">Detalhe</th>
              <th className="p-2 font-medium">Validade</th>
              <th className="p-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((i) => (
              <tr key={`${i.origem}-${i.id}`} className="border-t border-linha">
                <td className="p-2 text-texto">
                  {i.clienteId ? (
                    <Link href={`/clientes/${i.clienteId}`} className="underline">
                      {i.clienteNome}
                    </Link>
                  ) : (
                    i.clienteNome
                  )}
                </td>
                <td className="p-2 text-cinza">{i.titulo}</td>
                <td className="p-2 text-cinza">{i.detalhe}</td>
                <td className="p-2 text-cinza">{formatarData(i.validade)}</td>
                <td className="p-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${CLASSE[i.severidade]}`}>
                    {ROTULO[i.severidade]} · {i.diasRestantes} d
                  </span>
                </td>
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-cinza">
                  {itens.length ? "Nenhum item para este filtro." : "Nada vencendo nos próximos 60 dias."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
