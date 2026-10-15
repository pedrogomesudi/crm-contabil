"use server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { required } from "@/lib/env";
import type { EstadoConfirmar, EstadoNovoLink } from "./estados";

// Só convite e recuperação são usados (não há cadastro público). Validar o `type` recebido
// evita repassar entrada arbitrária ao verifyOtp.
const TIPOS_OK: readonly string[] = ["invite", "recovery"];

const LINK_MORTO = "Este link expirou ou já foi usado. Peça um novo abaixo.";

// Consome o token de uso único. Vive numa SERVER ACTION (POST), e não no GET da página,
// porque pré-visualizadores de link e scanners de e-mail buscam a URL e queimariam o token
// antes de a pessoa clicar — foi o que aconteceu em 15/10/2026 com o preview do WhatsApp.
export async function confirmarAcesso(_prev: EstadoConfirmar, formData: FormData): Promise<EstadoConfirmar> {
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  const supabase = await createServerSupabase();

  if (tokenHash && TIPOS_OK.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (error) {
      console.error("confirmarAcesso (verifyOtp):", error.message);
      return { erro: LINK_MORTO };
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("confirmarAcesso (exchangeCode):", error.message);
      return { erro: LINK_MORTO };
    }
  } else {
    return { erro: LINK_MORTO };
  }

  redirect("/redefinir-senha");
}

// Saída do beco: quem chega com link morto pede outro ali mesmo, sem depender do admin.
export async function solicitarNovoLink(_prev: EstadoNovoLink, formData: FormData): Promise<EstadoNovoLink> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  // Resposta neutra em TODOS os caminhos: esta tela é pública, e variar a mensagem a
  // transformaria num verificador de quais e-mails existem no sistema.
  const neutra = {
    mensagem:
      "Se este e-mail estiver cadastrado, enviamos um novo link. Pode levar alguns minutos — confira também o spam.",
  };
  if (!email) return neutra;

  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/confirmar` });
  // Loga só falha de infra (SMTP/rede) — sem alterar a resposta ao visitante.
  if (error) console.error("solicitarNovoLink (infra):", error.message);
  return neutra;
}
