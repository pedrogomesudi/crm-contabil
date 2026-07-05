"use client";
import { useActionState, useState } from "react";
import { enviarAssinatura, type EstadoAssinatura } from "@/app/(app)/clientes/[id]/assinatura";

export function EnviarAssinatura({
  documentoId,
  clienteId,
  clienteNome,
  clienteEmail,
}: {
  documentoId: string;
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
}) {
  const action = enviarAssinatura.bind(null, documentoId, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoAssinatura, FormData>(action, {});
  const [aberto, setAberto] = useState(false);
  const [testemunhas, setTestemunhas] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Enviado para assinatura ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-cinza">
        Enviar para assinatura
      </button>
    );

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded border border-linha p-3 text-sm">
      <p className="font-medium">Cliente (CONTRATANTE)</p>
      <input
        name="contratante_nome"
        defaultValue={clienteNome}
        placeholder="Nome"
        required
        className="w-full rounded border px-2 py-1"
      />
      <input
        name="contratante_email"
        type="email"
        defaultValue={clienteEmail}
        placeholder="E-mail"
        required
        className="w-full rounded border px-2 py-1"
      />
      <p className="font-medium">Representante do escritório (CONTRATADA)</p>
      <input name="contratada_nome" placeholder="Nome" required className="w-full rounded border px-2 py-1" />
      <input
        name="contratada_email"
        type="email"
        placeholder="E-mail"
        required
        className="w-full rounded border px-2 py-1"
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="incluir_testemunhas"
          checked={testemunhas}
          onChange={(e) => setTestemunhas(e.target.checked)}
        />
        Incluir 2 testemunhas
      </label>
      {testemunhas && (
        <div className="space-y-2">
          <input name="t1_nome" placeholder="Testemunha 1 — nome" className="w-full rounded border px-2 py-1" />
          <input name="t1_email" type="email" placeholder="Testemunha 1 — e-mail" className="w-full rounded border px-2 py-1" />
          <input name="t2_nome" placeholder="Testemunha 2 — nome" className="w-full rounded border px-2 py-1" />
          <input name="t2_email" type="email" placeholder="Testemunha 2 — e-mail" className="w-full rounded border px-2 py-1" />
        </div>
      )}
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Enviar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
