"use client";
import { useActionState } from "react";
import Link from "next/link";
import { entrar } from "@/app/login/actions";

export function LoginForm() {
  const [estado, action, pending] = useActionState<{ erro?: string }, FormData>(entrar, {});
  return (
    <form action={action} className="w-80 space-y-4 rounded-xl bg-white p-8 shadow">
      <h1 className="text-center text-xl font-semibold text-slate-900">CRM Contábil</h1>
      <input
        name="email"
        type="email"
        placeholder="E-mail"
        autoComplete="email"
        required
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
      />
      <input
        name="senha"
        type="password"
        placeholder="Senha"
        autoComplete="current-password"
        required
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
      />
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <Link href="/login/recuperar" className="block text-center text-sm text-slate-500">
        Esqueci minha senha
      </Link>
    </form>
  );
}
