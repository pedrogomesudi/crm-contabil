"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { salvarFlagFiscal } from "@/app/(app)/clientes/[id]/flags-actions";

type Tri = boolean | null;
type Campo = "folha" | "icms" | "iss";
const ROTULO: Record<Campo, string> = {
  folha: "Tem folha (funcionários)",
  icms: "Contribui ICMS",
  iss: "Contribui ISS",
};
const DICA: Record<Campo, string> = {
  folha: "nº de funcionários > 0",
  icms: "tem inscrição estadual",
  iss: "tem inscrição municipal",
};
const paraValor = (s: string): Tri => (s === "sim" ? true : s === "nao" ? false : null);
const paraSelect = (v: Tri): string => (v === true ? "sim" : v === false ? "nao" : "");

export function FlagsFiscaisSection({
  clienteId,
  podeEditar,
  valores,
  derivados,
}: {
  clienteId: string;
  podeEditar: boolean;
  valores: Record<Campo, Tri>;
  derivados: Record<Campo, boolean>;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (campo: Campo, s: string) =>
    start(async () => {
      const r = await salvarFlagFiscal(clienteId, campo, paraValor(s));
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Flags fiscais</h3>
      <p className="text-xs text-cinza">
        Determinam a incidência de obrigações. &quot;Auto&quot; deriva das inscrições e da folha; mudar vale para
        a próxima geração.
      </p>
      <div className="space-y-2">
        {(Object.keys(ROTULO) as Campo[]).map((campo) => (
          <label key={campo} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-48 text-grafite">{ROTULO[campo]}</span>
            <select
              className={controleCls("compacto")}
              value={paraSelect(valores[campo])}
              disabled={!podeEditar || pend}
              onChange={(e) => mudar(campo, e.target.value)}
            >
              <option value="">Auto → {derivados[campo] ? "Sim" : "Não"} ({DICA[campo]})</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        ))}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
