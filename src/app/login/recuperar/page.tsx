"use client";
import { useActionState } from "react";
import Link from "next/link";
import { recuperarSenha } from "@/app/login/actions";
import type { EstadoRecuperar } from "@/app/login/estados";
import { AuthCard } from "@/components/auth/AuthCard";
import { CampoTexto } from "@/components/auth/CampoTexto";

export default function RecuperarPage() {
  const [estado, action, pending] = useActionState<EstadoRecuperar, FormData>(recuperarSenha, {});
  return (
    <AuthCard titulo="Recuperar senha">
      <form action={action} className="space-y-4">
        <CampoTexto
          id="email"
          label="E-mail"
          name="email"
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          required
        />
        {estado.mensagem && (
          <p role="status" aria-live="polite" className="text-sm text-cinza">
            {estado.mensagem}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full rounded-lg bg-verde py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Enviar instruções"}
        </button>
        <Link href="/login" className="block text-center text-sm text-cinza">
          Voltar ao login
        </Link>
      </form>
    </AuthCard>
  );
}
