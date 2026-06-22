"use client";
import { useActionState } from "react";
import { convidarUsuario } from "@/app/(app)/usuarios/actions";
import type { EstadoConvite } from "@/app/(app)/usuarios/estados";
import { PAPEIS } from "@/lib/tipos";
import { Campo, inputCls } from "@/components/ui/Campo";

export function ConviteForm() {
  const [estado, action, pending] = useActionState<EstadoConvite, FormData>(convidarUsuario, {});
  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
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
        <div role="status" className="space-y-1 rounded bg-green-50 p-3 text-sm text-green-800">
          <p>Usuário criado.</p>
          {estado.link ? (
            <>
              <p>
                Enquanto o envio por e-mail não está ativo, copie o link de convite e envie ao
                usuário (ele define a senha por lá):
              </p>
              <code className="block break-all rounded bg-white p-2 text-xs text-slate-700">
                {estado.link}
              </code>
            </>
          ) : (
            <p>O e-mail de convite será enviado quando o SMTP estiver configurado.</p>
          )}
        </div>
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
