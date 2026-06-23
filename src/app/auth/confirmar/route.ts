import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

// Tipos de OTP aceitos neste callback (convite e recuperação). Validar o `type`
// vindo da URL evita repassar entrada arbitrária do usuário ao verifyOtp.
const TIPOS_OK: readonly EmailOtpType[] = ["invite", "recovery", "signup"];

function tipoValido(t: string | null): t is EmailOtpType {
  return t !== null && (TIPOS_OK as readonly string[]).includes(t);
}

// Callback de convite/recuperação. Trata o fluxo server-side do @supabase/ssr:
// - token_hash + type (verifyOtp): usado pelos links de convite/reset montados por nós
// - code (exchangeCodeForSession): fluxo PKCE
// Estabelece a sessão (cookie) e leva à tela de definir senha.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  const supabase = await createServerSupabase();

  if (tokenHash && tipoValido(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}/redefinir-senha`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/redefinir-senha`);
  }
  // Link expirado/inválido ou type não suportado: volta ao login com aviso.
  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
