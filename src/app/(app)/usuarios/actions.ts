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
  // Cria sem confirmar e-mail; a senha é definida pelo convidado via link.
  const { data: criado, error: errCreate } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (errCreate || !criado?.user) {
    const jaExiste = /exist|registered|already/i.test(errCreate?.message ?? "");
    return { erro: jaExiste ? "E-mail já cadastrado." : "Não foi possível criar o usuário." };
  }

  // Papel/nome definidos EXPLICITAMENTE (o trigger cria como assistente por causa
  // do timing do app_metadata). Upsert por id é robusto a corrida com o trigger.
  const { error: errPerfil } = await admin
    .from("usuarios")
    .upsert({ id: criado.user.id, email, nome, papel, ativo: true }, { onConflict: "id" });
  if (errPerfil) return { erro: "Usuário criado, mas falha ao definir o papel." };

  // Gera o token de convite. Montamos o link para o NOSSO /auth/confirmar usando
  // token_hash (fluxo server-side do @supabase/ssr via verifyOtp), em vez do
  // action_link (fluxo implícito por hash, que o SSR não processa).
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const { data: gen } = await admin.auth.admin.generateLink({ type: "invite", email });
  const tokenHash = gen?.properties?.hashed_token;
  const link =
    site && tokenHash ? `${site}/auth/confirmar?token_hash=${tokenHash}&type=invite` : undefined;

  revalidatePath("/usuarios");
  return { ok: true, link };
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
