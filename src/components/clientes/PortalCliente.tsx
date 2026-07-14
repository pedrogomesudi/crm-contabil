"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { convidarClientePortal, revogarAcessoPortal, type AcessoPortal } from "@/app/(app)/clientes/[id]/portal-actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

export function PortalCliente({ clienteId, acessos }: { clienteId: string; acessos: AcessoPortal[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function convidar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    setOk(false);
    const r = await convidarClientePortal(clienteId, new FormData(e.currentTarget));
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setOk(true);
    router.refresh();
  }
  async function revogar(usuarioId: string) {
    if (!confirm("Revogar o acesso deste usuário ao portal?")) return;
    setOcupado(true);
    const r = await revogarAcessoPortal(usuarioId, clienteId);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Portal do cliente</h2>
      <p className="mt-0.5 text-xs text-cinza">
        O cliente recebe um convite por e-mail, define a senha e passa a acessar o portal — onde vê apenas
        os documentos, notas fiscais, guias e boletos dele.
      </p>

      {acessos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {acessos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-linha px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-texto">{a.nome}</span>{" "}
                <span className="text-cinza">· {a.email}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                <span className={a.ativo ? "text-verde" : "text-cinza"}>{a.ativo ? "Ativo" : "Revogado"}</span>
                {a.ativo && (
                  <button disabled={ocupado} onClick={() => revogar(a.id)} className="text-negativo underline">revogar</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={convidar} className="mt-3 flex flex-wrap items-end gap-2 border-t border-linha pt-3">
        <label className="flex-1 text-xs text-cinza">Nome
          <input name="nome" required className={`mt-0.5 block w-full ${cls}`} />
        </label>
        <label className="flex-1 text-xs text-cinza">E-mail
          <input name="email" type="email" required className={`mt-0.5 block w-full ${cls}`} />
        </label>
        <button disabled={ocupado} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60">
          {ocupado ? "Convidando…" : "Convidar"}
        </button>
      </form>
      {ok && <p className="mt-1 text-xs text-verde">Convite enviado ✓</p>}
      {erro && <p role="alert" className="mt-1 text-xs text-negativo">{erro}</p>}
    </section>
  );
}
