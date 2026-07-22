"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { sair } from "@/app/login/actions";
import { codigoTotpValido } from "@/lib/auth/mfa";
import { AuthCard } from "@/components/auth/AuthCard";
import { CampoTexto } from "@/components/auth/CampoTexto";

export function VerificarMfa() {
  const [supabase] = useState(() => createBrowserSupabase());
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp[0];
      // Sem fator verificado não há o que desafiar — a sessão já basta, segue para o app.
      if (!totp) {
        router.replace("/");
        return;
      }
      setFactorId(totp.id);
    })();
  }, [supabase, router]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!factorId) return;
    if (!codigoTotpValido(codigo)) {
      setErro("Digite o código de 6 dígitos do aplicativo.");
      return;
    }
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
      if (error) {
        setErro("Código inválido ou expirado. Gere um novo no aplicativo e tente de novo.");
        return;
      }
      // Sessão agora é aal2; refresh para o gate do layout deixar passar.
      router.replace("/");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <AuthCard titulo="Verificação em duas etapas">
      <form onSubmit={verificar} className="space-y-4">
        <p className="text-sm text-cinza">
          Informe o código de 6 dígitos do seu aplicativo autenticador para concluir o acesso.
        </p>
        <CampoTexto
          id="codigo-totp"
          label="Código de verificação"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="000000"
          aria-invalid={erro ? true : undefined}
          required
        />
        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={ocupado || !factorId}
          aria-busy={ocupado}
          className="w-full rounded-lg bg-verde py-2 text-sm font-medium text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {ocupado ? "Verificando..." : "Verificar"}
        </button>
      </form>
      <form action={sair} className="mt-4">
        <button type="submit" className="block w-full text-center text-sm text-cinza hover:text-verde">
          Sair
        </button>
      </form>
    </AuthCard>
  );
}
