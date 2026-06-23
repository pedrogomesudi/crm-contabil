"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Botão de submit para as actions de linha (papel/status). Desabilita durante o
// envio (evita duplo-submit) e, se `confirmar` for passado, pede confirmação
// antes de disparar a ação destrutiva.
export function BotaoAcao({
  children,
  className,
  confirmar,
  rotulo,
}: {
  children: ReactNode;
  className?: string;
  confirmar?: string;
  rotulo: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={rotulo}
      className={`${className ?? ""} disabled:opacity-60`}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
