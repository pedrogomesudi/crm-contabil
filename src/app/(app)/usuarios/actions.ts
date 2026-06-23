"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PAPEIS, type Papel } from "@/lib/tipos";
import type { EstadoConvite } from "./estados";

// Todas as operações de usuário são privilegiadas: exigem admin e rodam com
// service_role (server-side). getPerfilAtual valida o papel a cada chamada.
async function exigirAdmin() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  return perfil;
}

function papelValido(p: string): p is Papel {
  return (PAPEIS as readonly string[]).includes(p);
}

export async function convidarUsuario(
  _prev: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  await exigirAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim();
  const papel = String(formData.get("papel") ?? "");
  if (!email || !nome) return { erro: "Informe e-mail e nome." };
  if (!papelValido(papel)) return { erro: "Papel inválido." };

  const admin = createAdminSupabase();
  // inviteUserByEmail cria o usuário E envia o e-mail de convite (via SMTP/Brevo)
  // usando o template "Invite user" (que aponta para /auth/confirmar?token_hash=).
  const { data: convidado, error: errConvite } = await admin.auth.admin.inviteUserByEmail(email);
  if (errConvite || !convidado?.user) {
    const jaExiste = /exist|registered|already/i.test(errConvite?.message ?? "");
    return { erro: jaExiste ? "E-mail já cadastrado." : "Não foi possível enviar o convite." };
  }

  // Papel/nome definidos EXPLICITAMENTE (o trigger cria como assistente por causa
  // do timing do app_metadata). Upsert por id é robusto a corrida com o trigger.
  const { error: errPerfil } = await admin
    .from("usuarios")
    .upsert({ id: convidado.user.id, email, nome, papel, ativo: true }, { onConflict: "id" });
  if (errPerfil) return { erro: "Convite enviado, mas falha ao definir o papel." };

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function alterarPapel(usuarioId: string, formData: FormData) {
  const eu = await exigirAdmin();
  if (usuarioId === eu.id) redirect("/usuarios?erro=self"); // não altera o próprio papel
  const papel = String(formData.get("papel") ?? "");
  if (!papelValido(papel)) redirect("/usuarios?erro=papel");

  const admin = createAdminSupabase();
  const { error } = await admin.from("usuarios").update({ papel }).eq("id", usuarioId);
  if (error) redirect("/usuarios?erro=1");
  revalidatePath("/usuarios");
  redirect("/usuarios?ok=papel");
}

export async function definirAtivo(usuarioId: string, ativo: boolean) {
  const eu = await exigirAdmin();
  if (usuarioId === eu.id) redirect("/usuarios?erro=self"); // não desativa a si mesmo

  const admin = createAdminSupabase();
  const { error } = await admin.from("usuarios").update({ ativo }).eq("id", usuarioId);
  if (error) redirect("/usuarios?erro=1");
  revalidatePath("/usuarios");
  redirect("/usuarios?ok=status");
}
