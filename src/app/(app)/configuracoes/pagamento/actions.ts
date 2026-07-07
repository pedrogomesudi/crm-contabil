"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type EstadoPagamento = { ok?: boolean; erro?: string };

export async function salvarDadosPagamento(_prev: EstadoPagamento, formData: FormData): Promise<EstadoPagamento> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const template = String(formData.get("mensagem_template") ?? "").trim();
  if (!template) return { erro: "O template da mensagem não pode ficar vazio." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("dados_bancarios").upsert(
    {
      id: 1,
      pix_chave: s("pix_chave"),
      banco: s("banco"),
      agencia: s("agencia"),
      conta: s("conta"),
      titular: s("titular"),
      documento: s("documento"),
      mensagem_template: template,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/pagamento");
  return { ok: true };
}
