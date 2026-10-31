"use client";
import { useEffect } from "react";
import { registrarErroCliente } from "./erro-actions";

// Error boundary do app. Antes dele, erro de navegador era INVISÍVEL: só o servidor registrava
// (instrumentation.ts), e uma tela que quebrava no celular não deixava rastro nenhum — o que
// transformou o diagnóstico do Atendimento numa sequência de deduções.
//
// Limite conhecido: isto captura EXCEÇÃO de JavaScript. Se o navegador encerrar a aba por
// memória, nada aqui roda — nesse caso a ausência de registro é, ela própria, a informação.
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void registrarErroCliente(
      { message: error.message, stack: error.stack, digest: error.digest },
      typeof window !== "undefined" ? window.location.pathname : "",
    );
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-lg font-semibold text-texto">Algo deu errado nesta tela</h1>
      <p className="text-sm text-cinza">
        O erro foi registrado e aparece em Configurações → Observabilidade. Você pode tentar de novo.
      </p>
      {error.digest && <p className="font-mono text-xs text-cinza-claro">código: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105"
      >
        Tentar de novo
      </button>
    </div>
  );
}
