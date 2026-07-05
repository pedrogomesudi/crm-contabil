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
      className="space-y-3 rounded-lg border border-linha bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-texto">Convidar usuário</h2>
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
        <p role="alert" className="text-sm text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="rounded bg-verde/10 p-3 text-sm text-verde">
          Convite enviado por e-mail. O usuário define a senha pelo link recebido.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
      >
        {pending ? "Convidando..." : "Convidar"}
      </button>
    </form>
  );
}
