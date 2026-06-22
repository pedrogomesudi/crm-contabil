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
          autoFocus
          required
        />
        {estado.mensagem && (
          <p role="status" aria-live="polite" className="text-sm text-slate-600">
            {estado.mensagem}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Enviar instruções"}
        </button>
        <Link href="/login" className="block text-center text-sm text-slate-600">
          Voltar ao login
        </Link>
      </form>
    </AuthCard>
  );
}
