"use client";
import { useState } from "react";
import { registrarAcessoBoleto } from "../actions";

// A 2ª via é um link externo do provedor: registramos o acesso (RF-053) e então abrimos.
export function LinkBoleto({ id, url }: { id: string; url: string }) {
  const [ocupado, setOcupado] = useState(false);
  async function abrir() {
    setOcupado(true);
    await registrarAcessoBoleto(id);
    setOcupado(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <button disabled={ocupado} onClick={abrir} className="text-verde underline disabled:opacity-60">
      baixar boleto (2ª via)
    </button>
  );
}
