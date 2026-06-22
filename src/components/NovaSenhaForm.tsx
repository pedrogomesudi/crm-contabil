"use client";
import { useActionState } from "react";
import { definirNovaSenha } from "@/app/login/actions";
import type { EstadoNovaSenha } from "@/app/login/estados";
import { AuthCard } from "@/components/auth/AuthCard";
import { CampoTexto } from "@/components/auth/CampoTexto";

export function NovaSenhaForm() {
  const [estado, action, pending] = useActionState<EstadoNovaSenha, FormData>(definirNovaSenha, {});
  return (
    <AuthCard titulo="Definir nova senha">
      <form action={action} className="space-y-4">
        <CampoTexto
          id="senha"
          label="Nova senha"
          name="senha"
          type="password"
          placeholder="Nova senha (mín. 8)"
          autoComplete="new-password"
          autoFocus
          required
          aria-describedby={estado.erro ? "senha-erro" : undefined}
          aria-invalid={estado.erro ? true : undefined}
        />
        <CampoTexto
          id="confirma"
          label="Confirmar nova senha"
          name="confirma"
          type="password"
          placeholder="Confirmar nova senha"
          autoComplete="new-password"
          required
          aria-describedby={estado.erro ? "senha-erro" : undefined}
          aria-invalid={estado.erro ? true : undefined}
        />
        {estado.erro && (
          <p id="senha-erro" role="alert" className="text-sm text-red-600">
            {estado.erro}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </AuthCard>
  );
}
