"use client";
import { useActionState } from "react";
import Link from "next/link";
import { entrar } from "@/app/login/actions";
import type { EstadoLogin } from "@/app/login/estados";
import { AuthCard } from "@/components/auth/AuthCard";
import { CampoTexto } from "@/components/auth/CampoTexto";

export function LoginForm({ aviso }: { aviso?: string }) {
  const [estado, action, pending] = useActionState<EstadoLogin, FormData>(entrar, {});
  return (
    <AuthCard titulo="CRM Contábil">
      {aviso && (
        <p role="status" className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          {aviso}
        </p>
      )}
      <form action={action} className="space-y-4">
        <CampoTexto
          id="email"
          label="E-mail"
          name="email"
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          required
          aria-describedby={estado.erro ? "login-erro" : undefined}
          aria-invalid={estado.erro ? true : undefined}
        />
        <CampoTexto
          id="senha"
          label="Senha"
          name="senha"
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          required
          aria-describedby={estado.erro ? "login-erro" : undefined}
          aria-invalid={estado.erro ? true : undefined}
        />
        {estado.erro && (
          <p id="login-erro" role="alert" className="text-sm text-negativo">
            {estado.erro}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full rounded-lg bg-verde py-2 text-sm font-medium text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
        <Link href="/login/recuperar" className="block text-center text-sm text-cinza hover:text-verde">
          Esqueci minha senha
        </Link>
      </form>
    </AuthCard>
  );
}
