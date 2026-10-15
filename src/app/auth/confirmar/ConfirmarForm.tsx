"use client";
import { useActionState } from "react";
import { confirmarAcesso, solicitarNovoLink } from "./actions";
import type { EstadoConfirmar, EstadoNovoLink } from "./estados";
import { CampoTexto } from "@/components/auth/CampoTexto";

const botaoCls =
  "w-full rounded-lg bg-verde px-4 py-2.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60";

// Pede um novo link. Aparece quando o link chega morto e também após uma tentativa falha,
// para a pessoa se destravar sozinha em vez de ser jogada no login sem saída.
export function NovoLinkForm({ titulo }: { titulo: string }) {
  const [estado, action, pendente] = useActionState<EstadoNovoLink, FormData>(solicitarNovoLink, {});
  if (estado.mensagem) return <p className="text-sm text-cinza">{estado.mensagem}</p>;
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-cinza">{titulo}</p>
      <CampoTexto
        id="email"
        label="E-mail"
        name="email"
        type="email"
        placeholder="seu@email.com"
        autoComplete="email"
        required
      />
      <button type="submit" disabled={pendente} className={botaoCls}>
        {pendente ? "Enviando…" : "Receber novo link"}
      </button>
    </form>
  );
}

// O clique aqui é o que consome o token — nunca o carregamento da página.
export function ConfirmarForm({ tokenHash, type, code }: { tokenHash: string; type: string; code: string }) {
  const [estado, action, pendente] = useActionState<EstadoConfirmar, FormData>(confirmarAcesso, {});
  if (estado.erro) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">{estado.erro}</p>
        <NovoLinkForm titulo="Informe seu e-mail para receber um link novo." />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="code" value={code} />
      <p className="text-sm text-cinza">Clique abaixo para confirmar seu acesso e definir sua senha.</p>
      <button type="submit" disabled={pendente} className={botaoCls}>
        {pendente ? "Confirmando…" : "Confirmar meu acesso"}
      </button>
    </form>
  );
}
