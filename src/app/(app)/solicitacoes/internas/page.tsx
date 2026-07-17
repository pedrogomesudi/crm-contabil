import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEPARTAMENTOS, rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import { SOLIC_INTERNA_STATUS, rotuloStatusInterno } from "@/lib/solicitacoes/interna";
import { formatarData } from "@/lib/format";
import { listarFila, type Filtros } from "./actions";
import { NovaInterna } from "./NovaInterna";

export const metadata = { title: "Solicitações internas" };

export default async function InternasPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");

  const sp = await searchParams;
  const fila = await listarFila(sp);
  const colaboradores = await listarColaboradores();

  const supabase = await createServerSupabase();
  const { data: u } = await supabase.from("usuarios").select("departamento").eq("id", perfil.id).maybeSingle();
  const { data: slas } = await supabase.from("departamento_sla").select("departamento, dias");
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social")
    .limit(300);

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/solicitacoes/internas?${q}` : "/solicitacoes/internas";
  };
  const chip = (ativo: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs ${ativo ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza"}`;

  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <div className="flex gap-1 text-sm">
        <Link href="/solicitacoes" className="rounded-lg border border-linha px-3 py-1.5 text-cinza">
          Do cliente
        </Link>
        <span className="rounded-lg border border-verde bg-verde/10 px-3 py-1.5 text-verde">Internas</span>
      </div>

      <PageHeader titulo="Solicitações internas" subtitulo="Pedidos entre departamentos, com SLA e fila" />
      <NovaInterna
        meuDepartamento={(u?.departamento as Departamento | null) ?? null}
        clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
        colaboradores={colaboradores}
        slas={(slas ?? []).map((s) => ({ departamento: s.departamento as string, dias: s.dias as number }))}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={link({ destino: undefined })} className={chip(!sp.destino)}>
          Todos os destinos
        </Link>
        {DEPARTAMENTOS.map((d) => (
          <Link key={d.valor} href={link({ destino: d.valor })} className={chip(sp.destino === d.valor)}>
            {d.rotulo}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={link({ status: undefined })} className={chip(!sp.status)}>
          Todos os status
        </Link>
        {SOLIC_INTERNA_STATUS.map((s) => (
          <Link key={s.valor} href={link({ status: s.valor })} className={chip(sp.status === s.valor)}>
            {s.rotulo}
          </Link>
        ))}
        <Link href={link({ vencidas: sp.vencidas === "1" ? undefined : "1" })} className={chip(sp.vencidas === "1")}>
          SLA vencido
        </Link>
        <Link href={link({ minhas: sp.minhas === "1" ? undefined : "1" })} className={chip(sp.minhas === "1")}>
          Só as minhas
        </Link>
        <Link href={link({ semDono: sp.semDono === "1" ? undefined : "1" })} className={chip(sp.semDono === "1")}>
          Sem responsável
        </Link>
      </div>

      {fila.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma solicitação com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
          {fila.map((s) => (
            <li key={s.id}>
              <Link
                href={`/solicitacoes/internas/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm hover:bg-creme"
              >
                <span>
                  <span className="font-mono text-xs text-cinza">#{s.numero}</span>{" "}
                  <span className="font-medium text-texto">{s.assunto}</span>
                  <span className="block text-xs text-cinza">
                    {rotuloDepartamento(s.origem)} → {rotuloDepartamento(s.destino)}
                    {s.clienteNome && ` · ${s.clienteNome}`}
                    {s.solicitanteNome && ` · pedido por ${s.solicitanteNome}`}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className={s.responsavelId ? "text-cinza" : "text-atencao"}>
                    {s.responsavelNome ?? "na fila"}
                  </span>
                  <span className="text-cinza">{rotuloStatusInterno(s.status)}</span>
                  <span className={s.vencida ? "font-semibold text-negativo" : "text-cinza"}>
                    {s.prazo ? formatarData(s.prazo) : "—"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
