"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirAlertasAtivos } from "@/app/(app)/onboarding/alertas-actions";

export function ToggleAlertas({ ativoInicial }: { ativoInicial: boolean }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [ocupado, setOcupado] = useState(false);
  async function mudar(novo: boolean) {
    setAtivo(novo);
    setOcupado(true);
    const r = await definirAlertasAtivos(novo);
    setOcupado(false);
    if (r.erro) {
      setAtivo(!novo);
      return alert(r.erro);
    }
    router.refresh();
  }
  return (
    <label className="flex items-center gap-2 text-sm text-texto">
      <input type="checkbox" checked={ativo} disabled={ocupado} onChange={(e) => mudar(e.target.checked)} />
      Notificações de prazo {ativo ? "ligadas" : "desligadas"}
    </label>
  );
}
