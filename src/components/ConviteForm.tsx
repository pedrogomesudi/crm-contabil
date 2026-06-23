"use client";
import { useActionState, useEffect, useRef } from "react";
import { convidarUsuario } from "@/app/(app)/usuarios/actions";
import type { EstadoConvite } from "@/app/(app)/usuarios/estados";
import { PAPEIS } from "@/lib/tipos";
import { Campo, inputCls } from "@/components/ui/Campo";

export function ConviteForm() {
  const [estado, action, pending] = useActionState<EstadoConvite, FormData>(convidarUsuario, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Limpa os campos após um convite bem-sucedido (evita reenviar o mesmo e-mail).
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado.ok]);
  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-900">Convidar usuário</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo label="Nome">
          <input name="nome" required className={inputCls} />
        </Campo>
        <Campo label="E-mail">
          <input name="email" type="email" required className={inputCls} />
        </Campo>
        <Campo label="Papel">
          <select name="papel" required defaultValue="assistente" className={inputCls}>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {estado.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">
          Convite enviado por e-mail. O usuário define a senha pelo link recebido.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Convidando..." : "Convidar"}
      </button>
    </form>
  );
}
