import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { EstadoContrato } from "@/lib/comercial/contratoProposta";

export async function carregarEstadoContrato(oportunidadeId: string, propostaAceita: boolean): Promise<EstadoContrato> {
  const vazio: EstadoContrato = {
    oportunidadeId,
    clienteId: null,
    contratoDocId: null,
    assinaturaStatus: null,
    propostaAceita,
  };
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return vazio;
  const supabase = await createServerSupabase();

  const { data: op } = await supabase.from("oportunidade").select("cliente_id").eq("id", oportunidadeId).maybeSingle();
  const clienteId = (op?.cliente_id as string | null) ?? null;
  if (!clienteId) return vazio;

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, nome")
    .eq("cliente_id", clienteId)
    .eq("tipo", "Contrato")
    .ilike("nome", "%.pdf")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const contratoDocId = (doc?.id as string | null) ?? null;
  if (!contratoDocId) return { ...vazio, clienteId };

  const { data: ass } = await supabase
    .from("assinaturas")
    .select("status")
    .eq("documento_id", contratoDocId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ...vazio, clienteId, contratoDocId, assinaturaStatus: (ass?.status as string | null) ?? null };
}
