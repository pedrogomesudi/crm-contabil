import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

// Callback de convite/recuperação. Trata o fluxo server-side do @supabase/ssr:
// - token_hash + type (verifyOtp): usado pelos links de convite/reset montados por nós
// - code (exchangeCodeForSession): fluxo PKCE
// Estabelece a sessão (cookie) e leva à tela de definir senha.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createServerSupabase();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}/redefinir-senha`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/redefinir-senha`);
  }
  return NextResponse.redirect(`${origin}/login`);
}
