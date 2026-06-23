"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { required } from "@/lib/env";
import type { EstadoLogin, EstadoRecuperar, EstadoNovaSenha } from "./estados";

export async function entrar(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    // Credencial inválida -> mensagem genérica (não vaza). Erro de infraestrutura
    // (rede, API key, Supabase fora) -> mensagem distinta + log server-side.
    if (error.code === "invalid_credentials" || error.status === 400) {
      return { erro: "E-mail ou senha inválidos." };
    }
    console.error("Erro no login (infra):", error.status, error.message);
    return { erro: "Não foi possível entrar agora. Tente novamente em instantes." };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function recuperarSenha(
  _prev: EstadoRecuperar,
  formData: FormData,
): Promise<EstadoRecuperar> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { mensagem: "Informe o e-mail." };

  const supabase = await createServerSupabase();
  // Site URL obrigatório: sem ele o Supabase usaria o Site URL do painel como
  // redirectTo, que pode estar errado. Esta URL precisa estar nas "Redirect URLs".
  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/auth/confirmar`,
  });
  // Loga só falhas de infra (SMTP/rede) — sem alterar a resposta neutra ao cliente.
  if (error) console.error("recuperarSenha (infra):", error.status, error.message);
  // Resposta neutra (não revela se o e-mail existe).
  return { mensagem: "Se o e-mail existir, enviaremos instruções de recuperação." };
}

export async function definirNovaSenha(
  _prev: EstadoNovaSenha,
  formData: FormData,
): Promise<EstadoNovaSenha> {
  const senha = String(formData.get("senha") ?? "");
  const confirma = String(formData.get("confirma") ?? "");
  if (senha.length < 8) return { erro: "A senha deve ter ao menos 8 caracteres." };
  if (senha !== confirma) return { erro: "As senhas não conferem." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    return {
      erro: "Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo em “Esqueci minha senha”.",
    };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function sair() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut(); // scope local (sessão deste dispositivo)
  revalidatePath("/", "layout");
  redirect("/login");
}
