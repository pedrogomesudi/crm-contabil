import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitir } from "@/lib/webhooks/emitir";

const MAX = 10 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/png", "image/jpeg"];
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

export type BaixaObrigacaoInput = {
  instanciaId: string;
  data?: string;
  observacao?: string | null;
  comprovante?: { bytes: Uint8Array; nome: string; mime: string } | null;
};
// Núcleo compartilhado (action UI + API). Lê a instância e escreve via `admin`.
export async function darBaixaObrigacaoNucleo(
  input: BaixaObrigacaoInput,
  ctx: { admin: SupabaseClient; autorId: string | null },
): Promise<{ ok: true; clienteId: string } | { ok: false; erro: string }> {
  const { data: inst } = await ctx.admin
    .from("obrigacao_instancia")
    .select("cliente_id, comprovante_path, obrigacao(comprovante_obrigatorio)")
    .eq("id", input.instanciaId)
    .maybeSingle();
  if (!inst) return { ok: false, erro: "Instância não encontrada." };
  const obr = (Array.isArray(inst.obrigacao) ? inst.obrigacao[0] : inst.obrigacao) as {
    comprovante_obrigatorio?: boolean;
  } | null;
  const tem = !!input.comprovante && input.comprovante.bytes.byteLength > 0;
  if (obr?.comprovante_obrigatorio && !tem) return { ok: false, erro: "Comprovante obrigatório para esta obrigação." };

  let comprovantePath: string | null = (inst.comprovante_path as string | null) ?? null;
  if (tem && input.comprovante) {
    if (input.comprovante.bytes.byteLength > MAX) return { ok: false, erro: "Arquivo acima de 10 MB." };
    if (!TIPOS.includes(input.comprovante.mime)) return { ok: false, erro: "Tipo não permitido (PDF, PNG ou JPG)." };
    const caminho = `obrigacoes/${inst.cliente_id}/${input.instanciaId}/${crypto.randomUUID()}-${nomeSeguro(input.comprovante.nome)}`;
    const up = await ctx.admin.storage
      .from("documentos")
      .upload(caminho, input.comprovante.bytes, { contentType: input.comprovante.mime });
    if (up.error) return { ok: false, erro: "Falha no upload." };
    comprovantePath = caminho;
  }
  const { error } = await ctx.admin
    .from("obrigacao_instancia")
    .update({
      status: "pendente",
      entregue_em: input.data || hojeSP(),
      entregue_por: ctx.autorId,
      observacao: input.observacao ?? null,
      comprovante_path: comprovantePath,
    })
    .eq("id", input.instanciaId);
  if (error) {
    if (tem && comprovantePath) await ctx.admin.storage.from("documentos").remove([comprovantePath]);
    return { ok: false, erro: "Falha ao registrar a baixa." };
  }
  await emitir("obrigacao.entregue", input.instanciaId);
  return { ok: true, clienteId: inst.cliente_id as string };
}
