import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { required } from "@/lib/env";

// GET com efeito colateral (verifyOtp consome token de uso único): nunca cachear/
// pré-renderizar (scanners de e-mail pré-buscam links e queimariam o token).
export const dynamic = "force-dynamic";

// Tipos de OTP aceitos neste callback. Só convite e recuperação são usados (não há
// signup público). Validar o `type` da URL evita repassar entrada arbitrária ao verifyOtp.
const TIPOS_OK: readonly EmailOtpType[] = ["invite", "recovery"];

function tipoValido(t: string | null): t is EmailOtpType {
  return t !== null && (TIPOS_OK as readonly string[]).includes(t);
}

// Callback de convite/recuperação. Trata o fluxo server-side do @supabase/ssr:
// - token_hash + type (verifyOtp): usado pelos links de convite/reset montados por nós
// - code (exchangeCodeForSession): fluxo PKCE
// Estabelece a sessão (cookie) e leva à tela de definir senha. O host do redirect vem
// de NEXT_PUBLIC_SITE_URL (confiável), não do request (evita host poisoning atrás do proxy).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");

  const supabase = await createServerSupabase();

  if (tokenHash && tipoValido(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${site}/redefinir-senha`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${site}/redefinir-senha`);
  }
  // Link expirado/inválido ou type não suportado: volta ao login com aviso.
  return NextResponse.redirect(`${site}/login?erro=link_invalido`);
}
