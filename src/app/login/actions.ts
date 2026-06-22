"use server";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function entrar(_prev: { erro?: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) return { erro: "E-mail ou senha inválidos." };
  redirect("/");
}

export async function recuperarSenha(_prev: { mensagem?: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { mensagem: "Informe o e-mail." };

  const supabase = await createServerSupabase();
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  await supabase.auth.resetPasswordForEmail(
    email,
    site ? { redirectTo: `${site}/login` } : undefined,
  );
  // Resposta neutra (não revela se o e-mail existe).
  return { mensagem: "Se o e-mail existir, enviaremos instruções de recuperação." };
}

export async function sair() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
