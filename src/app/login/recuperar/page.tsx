"use client";
import { useActionState } from "react";
import Link from "next/link";
import { recuperarSenha } from "../actions";

export default function RecuperarPage() {
  const [estado, action, pending] = useActionState<{ mensagem?: string }, FormData>(
    recuperarSenha,
    {},
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <form action={action} className="w-80 space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-center text-xl font-semibold text-slate-900">Recuperar senha</h1>
        <input
          name="email"
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
        />
        {estado.mensagem && <p className="text-sm text-slate-600">{estado.mensagem}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Enviar instruções"}
        </button>
        <Link href="/login" className="block text-center text-sm text-slate-500">
          Voltar ao login
        </Link>
      </form>
    </main>
  );
}
