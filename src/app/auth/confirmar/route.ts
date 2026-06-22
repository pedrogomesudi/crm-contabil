import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Callback do link de recuperação de senha: troca o `code` (PKCE) por sessão
// (de recuperação) e leva à tela de definir nova senha. Em Route Handler o
// cookie de sessão é gravado corretamente (ao contrário de Server Component).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/redefinir-senha`);
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
