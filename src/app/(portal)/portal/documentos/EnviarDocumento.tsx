"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarDocumento } from "../actions";

export function EnviarDocumento() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    setOk(false);
    const form = e.currentTarget;
    const r = await enviarDocumento(new FormData(form));
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setOk(true);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <h2 className="font-display text-sm font-semibold text-texto">Enviar documento</h2>
      <p className="text-xs text-cinza">PDF, PNG ou JPG, até 10 MB. Seu contador é avisado automaticamente.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="arquivo" accept="application/pdf,image/png,image/jpeg" required className="text-xs" />
        <button disabled={ocupado} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
          {ocupado ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {ok && <p className="text-xs text-verde">Documento enviado ✓</p>}
      {erro && <p role="alert" className="text-xs text-negativo">{erro}</p>}
    </form>
  );
}
