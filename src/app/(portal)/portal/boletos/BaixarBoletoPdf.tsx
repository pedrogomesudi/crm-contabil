"use client";
import { useState } from "react";
import { urlBoletoPdf } from "../actions";

export function BaixarBoletoPdf({ id }: { id: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function baixar() {
    setErro("");
    setOcupado(true);
    const r = await urlBoletoPdf(id);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }
  return (
    <span className="flex items-center gap-2">
      <button disabled={ocupado} onClick={baixar} className="text-verde underline disabled:opacity-60">
        baixar boleto (PDF)
      </button>
      {erro && <span className="text-negativo">{erro}</span>}
    </span>
  );
}
