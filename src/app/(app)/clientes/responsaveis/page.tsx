import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { PageHeader } from "@/components/ui/PageHeader";
import { RedistribuicaoCarteira } from "./RedistribuicaoCarteira";

export const metadata = { title: "Responsáveis por departamento" };

const LIMITE = 200;
const DEPTOS = new Set<Departamento>(["contabil", "fiscal", "pessoal", "societario"]);

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export default async function ResponsaveisPage({
  searchParams,
}: {
  searchParams: Promise<{ depto?: string; resp?: string; q?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarResponsaveis(perfil.papel)) redirect("/clientes");

  const sp = await searchParams;
  const depto = (DEPTOS.has(sp.depto as Departamento) ? sp.depto : "contabil") as Departamento;
  const resp = sp.resp ?? "";
  const q = (sp.q ?? "").slice(0, 100);

  const supabase = await createServerSupabase();
  let query = supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj")
    .is("excluido_em", null)
    .order("razao_social")
    .limit(LIMITE);
  if (q) query = query.ilike("razao_social", `%${escapeLike(q)}%`);
  const { data: clientesRaw } = await query;
  const clientes = clientesRaw ?? [];

  const ids = clientes.map((c) => c.id as string);
  const { data: respRows } = ids.length
    ? await supabase
        .from("cliente_responsavel")
        .select("cliente_id, usuario_id")
        .eq("departamento", depto)
        .in("cliente_id", ids)
    : { data: [] };
  const respPorCliente = new Map<string, string>(
    (respRows ?? []).map((r) => [r.cliente_id as string, r.usuario_id as string]),
  );

  const colaboradores = await listarColaboradores();

  // Filtro por responsável atual (em memória): id específico, "nenhum" (sem responsável) ou "" (qualquer).
  const lista = clientes
    .map((c) => ({
      id: c.id as string,
      razaoSocial: (c.razao_social as string) ?? "—",
      cpfCnpj: (c.cpf_cnpj as string) ?? "",
      responsavelId: respPorCliente.get(c.id as string) ?? null,
    }))
    .filter((c) => (resp === "" ? true : resp === "nenhum" ? c.responsavelId === null : c.responsavelId === resp));

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader
        titulo="Responsáveis por departamento"
        subtitulo="Redistribuição de carteira — filtre, marque e atribua em massa"
      />
      <RedistribuicaoCarteira
        clientes={lista}
        colaboradores={colaboradores}
        departamentos={DEPARTAMENTOS}
        filtros={{ depto, resp, q }}
      />
    </main>
  );
}
