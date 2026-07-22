"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { codigoTotpValido } from "@/lib/auth/mfa";
import { Input } from "@/components/ui/Input";
import { Botao } from "@/components/ui/Botao";
import { Card } from "@/components/ui/Card";

// Fases da tela. `enrolando` guarda o QR/segredo do fator recém-criado (ainda não verificado);
// só vira `ativo` depois do challengeAndVerify.
type Estado =
  | { fase: "carregando" }
  | { fase: "inativo" }
  | { fase: "enrolando"; factorId: string; qr: string; secret: string }
  | { fase: "ativo"; factorId: string };

export function ContaSeguranca() {
  const [supabase] = useState(() => createBrowserSupabase());
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) {
      setErro("Não foi possível carregar a configuração de 2FA.");
      setEstado({ fase: "inativo" });
      return;
    }
    // data.totp já vem só com fatores TOTP verificados.
    const verificado = data.totp[0];
    setEstado(verificado ? { fase: "ativo", factorId: verificado.id } : { fase: "inativo" });
  }, [supabase]);

  useEffect(() => {
    // Carga inicial dos fatores (I/O externo): setState só ocorre após o await em carregar().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function ativar() {
    setErro(null);
    setOcupado(true);
    try {
      // Remove fatores TOTP não verificados de tentativas anteriores (senão acumulam lixo
      // e podem colidir de friendly name no próximo enroll).
      const { data: atuais } = await supabase.auth.mfa.listFactors();
      for (const f of atuais?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        setErro("Não foi possível iniciar o 2FA. Tente novamente.");
        return;
      }
      setCodigo("");
      setEstado({ fase: "enrolando", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (estado.fase !== "enrolando") return;
    setErro(null);
    if (!codigoTotpValido(codigo)) {
      setErro("Digite o código de 6 dígitos do aplicativo.");
      return;
    }
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: estado.factorId,
        code: codigo.trim(),
      });
      if (error) {
        setErro("Código inválido ou expirado. Gere um novo no aplicativo e tente de novo.");
        return;
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    if (estado.fase !== "ativo") return;
    if (!window.confirm("Desativar o 2FA desta conta? Você poderá reativar quando quiser.")) return;
    setErro(null);
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: estado.factorId });
      if (error) {
        setErro("Não foi possível desativar o 2FA.");
        return;
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold tracking-tight text-texto">Verificação em duas etapas</h1>
        <Link href="/" className="text-sm text-verde hover:underline">
          Voltar
        </Link>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">
          {erro}
        </p>
      )}

      {estado.fase === "carregando" && <p className="text-sm text-cinza">Carregando…</p>}

      {estado.fase === "inativo" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-cinza">
            Ative o 2FA para exigir, a cada login, um código do aplicativo autenticador (Google Authenticator, Authy,
            1Password) além da senha.
          </p>
          <Botao type="button" onClick={ativar} disabled={ocupado} className="self-start">
            Ativar 2FA
          </Botao>
        </Card>
      )}

      {estado.fase === "enrolando" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-cinza">
            Escaneie o QR code no seu aplicativo autenticador ou digite o segredo manualmente. Depois, informe o código
            de 6 dígitos para confirmar.
          </p>
          <div className="self-center rounded-lg bg-white p-3">
            <Image
              src={`data:image/svg+xml;utf-8,${estado.qr}`}
              alt="QR code para configurar o 2FA"
              width={200}
              height={200}
              unoptimized
            />
          </div>
          <p className="break-all text-center font-mono text-xs text-cinza">{estado.secret}</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="000000"
            aria-label="Código de verificação"
            className="w-full text-center tracking-widest"
          />
          <Botao type="button" onClick={confirmar} disabled={ocupado} className="self-start">
            Confirmar e ativar
          </Botao>
        </Card>
      )}

      {estado.fase === "ativo" && (
        <Card className="flex flex-col gap-4">
          <p className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde">2FA ativo nesta conta.</p>
          <Botao type="button" variante="secundario" onClick={desativar} disabled={ocupado} className="self-start">
            Desativar 2FA
          </Botao>
        </Card>
      )}
    </main>
  );
}
