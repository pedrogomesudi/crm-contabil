"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { required } from "@/lib/env";

const emailSchema = z.string().email();

export type AcessoPortal = { id: string; nome: string; email: string; ativo: boolean };

// Convidar/revogar acesso ao portal é gestão de acesso: só admin/assistente.
async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || (p.papel !== "admin" && p.papel !== "assistente")) return null;
  return p;
}

export async function listarAcessosPortal(clienteId: string): Promise<AcessoPortal[]> {
  if (!(await gate())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome, email, ativo")
    .eq("papel", "cliente")
    .eq("cliente_id", clienteId)
    .order("nome");
  return (data ?? []).map((u) => ({ id: u.id as string, nome: u.nome as string, email: u.email as string, ativo: u.ativo as boolean }));
}

export async function convidarClientePortal(clienteId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const emailBruto = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 160);
  if (!emailBruto || !nome) return { erro: "Informe e-mail e nome." };
  const email = emailSchema.safeParse(emailBruto);
  if (!email.success) return { erro: "E-mail inválido." };

  const admin = createAdminSupabase();
  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  const { data: convidado, error: errConvite } = await admin.auth.admin.inviteUserByEmail(
    email.data,
    { redirectTo: `${site}/auth/confirmar` },
  );
  if (errConvite || !convidado?.user) {
    const jaExiste = /exist|registered|already/i.test(errConvite?.message ?? "");
    if (!jaExiste) console.error("convidarClientePortal (invite):", errConvite?.message);
    return { erro: jaExiste ? "E-mail já cadastrado na plataforma." : "Não foi possível enviar o convite." };
  }

  // O trigger cria o perfil como 'assistente'; aqui definimos EXPLICITAMENTE o papel
  // 'cliente' e o vínculo com o cadastro (a constraint chk_usuario_cliente exige o par).
  const { error: errPerfil } = await admin
    .from("usuarios")
    .upsert(
      { id: convidado.user.id, email: email.data, nome, papel: "cliente", cliente_id: clienteId, ativo: true },
      { onConflict: "id" },
    );
  if (errPerfil) {
    console.error("convidarClientePortal (upsert):", errPerfil.message);
    return { erro: "Convite enviado, mas o vínculo falhou. Revogue e tente de novo." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function revogarAcessoPortal(usuarioId: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  // Desativa (não apaga): preserva a trilha e já corta o acesso — auth_cliente_id()
  // exige `ativo`.
  const { error } = await admin
    .from("usuarios")
    .update({ ativo: false })
    .eq("id", usuarioId)
    .eq("papel", "cliente")
    .eq("cliente_id", clienteId);
  if (error) return { erro: "Falha ao revogar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
