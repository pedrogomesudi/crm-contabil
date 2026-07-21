import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { controleCls } from "@/components/ui/Campo";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
import Link from "next/link";
import { lerFiltroBusca } from "@/lib/documentos/busca-metadados";
import { buscarDocumentos, contarDocsVencidos } from "./actions";
import { TabelaResultadosBusca } from "@/components/documentos/TabelaResultadosBusca";

export const metadata = { title: "Documentos" };
const EQUIPE = ["admin", "assistente", "contador", "financeiro"];

export default async function DocumentosBuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !EQUIPE.includes(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const filtro = lerFiltroBusca(sp);

  const supabase = await createServerSupabase();
  const [{ data: clientes }, tipos, docs, vencidos] = await Promise.all([
    supabase.from("clientes").select("id, razao_social").is("excluido_em", null).order("razao_social").limit(500),
    carregarTiposAtivos(),
    buscarDocumentos(filtro),
    perfil.papel === "admin" ? contarDocsVencidos() : Promise.resolve(0),
  ]);

  return (
    <Container className="space-y-5 p-4">
      <PageHeader titulo="Documentos" subtitulo="Busca por nome, tipo, departamento, competência e cliente" />
      {perfil.papel === "admin" && vencidos > 0 && (
        <Link
          href="/documentos/retencao"
          className="block rounded-lg border border-linha bg-creme px-3 py-2 text-sm text-texto underline"
        >
          {vencidos} documento(s) vencido(s) na retenção — revisar
        </Link>
      )}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input
          name="nome"
          defaultValue={filtro.nome ?? ""}
          placeholder="nome do arquivo"
          className={controleCls("compacto")}
        />
        <input
          name="conteudo"
          defaultValue={filtro.conteudo ?? ""}
          placeholder="texto no conteúdo (PDF)"
          className={controleCls("compacto")}
        />
        <select name="tipo" defaultValue={filtro.tipoId ?? ""} className={controleCls("compacto")}>
          <option value="">todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <select name="departamento" defaultValue={filtro.departamento ?? ""} className={controleCls("compacto")}>
          <option value="">todos os departamentos</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
        <input
          type="month"
          name="competencia"
          defaultValue={filtro.competencia ?? ""}
          className={controleCls("compacto")}
        />
        <select name="cliente" defaultValue={filtro.clienteId ?? ""} className={controleCls("compacto")}>
          <option value="">todos os clientes</option>
          {(clientes ?? []).map((c) => (
            <option key={c.id as string} value={c.id as string}>
              {c.razao_social as string}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105"
        >
          Buscar
        </button>
      </form>
      <TabelaResultadosBusca docs={docs} />
    </Container>
  );
}
