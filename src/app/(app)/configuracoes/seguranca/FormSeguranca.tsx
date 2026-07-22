"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarMfaObrigatorio } from "./actions";

export function FormSeguranca({ obrigatorio }: { obrigatorio: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function alternar(valor: boolean) {
    setOcupado(true);
    const r = await salvarMfaObrigatorio(valor);
    setOcupado(false);
    if (r?.erro) {
      alert(r.erro);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-3 text-sm text-texto">
        <input
          type="checkbox"
          checked={obrigatorio}
          disabled={ocupado}
          onChange={(e) => alternar(e.target.checked)}
        />
        Exigir 2FA de toda a equipe
      </label>
      <p className="text-xs text-cinza">
        Com a exigência ligada, quem ainda não configurou a verificação em duas etapas é levado à tela
        de configuração no próximo acesso e não pode desativá-la enquanto a política estiver ativa. O
        portal do cliente não é afetado.
      </p>
    </section>
  );
}
