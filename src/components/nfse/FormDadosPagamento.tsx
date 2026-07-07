"use client";
import { useActionState } from "react";
import { salvarDadosPagamento, type EstadoPagamento } from "@/app/(app)/configuracoes/pagamento/actions";

type Dados = {
  pix_chave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  titular?: string | null;
  documento?: string | null;
  mensagem_template?: string | null;
} | null;

const cls = "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde";

export function FormDadosPagamento({ inicial }: { inicial: Dados }) {
  const [estado, action, pend] = useActionState<EstadoPagamento, FormData>(salvarDadosPagamento, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-linha bg-white p-5 text-sm">
      <label className="block text-cinza">
        Chave PIX
        <input name="pix_chave" defaultValue={inicial?.pix_chave ?? ""} className={cls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-cinza">
          Banco
          <input name="banco" defaultValue={inicial?.banco ?? ""} className={cls} />
        </label>
        <label className="block text-cinza">
          Agência
          <input name="agencia" defaultValue={inicial?.agencia ?? ""} className={cls} />
        </label>
        <label className="block text-cinza">
          Conta
          <input name="conta" defaultValue={inicial?.conta ?? ""} className={cls} />
        </label>
        <label className="block text-cinza">
          Titular
          <input name="titular" defaultValue={inicial?.titular ?? ""} className={cls} />
        </label>
      </div>
      <label className="block text-cinza">
        CNPJ/Documento do titular
        <input name="documento" defaultValue={inicial?.documento ?? ""} className={cls} />
      </label>
      <label className="block text-cinza">
        Mensagem
        <textarea name="mensagem_template" rows={8} defaultValue={inicial?.mensagem_template ?? ""} className={cls} required />
        <span className="mt-1 block text-xs text-cinza-claro">
          Marcadores (ignora maiúscula/acento): <code>{"{NOME}"}</code> (contato) · <code>{"{EMPRESA}"}</code> ·{" "}
          <code>{"{COMPETÊNCIA}"}</code> · <code>{"{VALOR}"}</code> (sem R$, ex.: 300,00) · <code>{"{VENCIMENTO}"}</code> ·{" "}
          <code>{"{CHAVE PIX}"}</code> · <code>{"{RAZÃO SOCIAL}"}</code> (favorecido) · <code>{"{CNPJ}"}</code> ·{" "}
          <code>{"{BANCO}"}</code> · <code>{"{AG}"}</code> · <code>{"{CONTA}"}</code> · <code>{"{PAGAMENTO}"}</code> (bloco PIX+TED pronto).
        </span>
      </label>
      {estado.erro && <p className="text-negativo">{estado.erro}</p>}
      {estado.ok && <p className="text-verde">Salvo ✓</p>}
      <button
        type="submit"
        disabled={pend}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pend ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
