"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirNotificacaoRiscos } from "./actions";

export function ToggleNotificacoes({ ativoInicial }: { ativoInicial: boolean }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [ocupado, setOcupado] = useState(false);
  async function mudar(novo: boolean) {
    setAtivo(novo);
    setOcupado(true);
    const r = await definirNotificacaoRiscos(novo);
    setOcupado(false);
    if (r.erro) {
      setAtivo(!novo);
      return alert(r.erro);
    }
    router.refresh();
  }
  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-3">
      <h2 className="font-display text-lg font-semibold text-texto">Notificações de obrigações</h2>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" checked={ativo} disabled={ocupado} onChange={(e) => mudar(e.target.checked)} />
        Badge de riscos no menu {ativo ? "ligado" : "desligado"}
      </label>
      <p className="text-xs text-cinza">
        Liga/desliga o contador vermelho no item “Obrigações” do menu lateral. Não afeta o painel de riscos nem a
        geração do calendário.
      </p>
    </section>
  );
}
