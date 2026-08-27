"use client";
import { useState, useTransition } from "react";
import { controleCls } from "@/components/ui/Campo";
import type { CanalCobranca } from "@/lib/clientes/canal-cobranca";

const OPCOES: { valor: CanalCobranca; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "ambos", rotulo: "WhatsApp e e-mail" },
  { valor: "nao_enviar", rotulo: "Não enviar" },
];

// Um seletor de canal reusado no cadastro (modo form: passa `name`, sem `onSelecionar`) e na
// aba Financeiro (modo autônomo: passa `onSelecionar`, sem `name`, grava na hora).
export function SeletorCanalCobranca({
  inicial,
  name,
  onSelecionar,
  disabled,
}: {
  inicial: CanalCobranca;
  name?: string;
  onSelecionar?: (canal: CanalCobranca) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [valor, setValor] = useState<CanalCobranca>(inicial);
  const [salvando, start] = useTransition();

  function handleChange(next: CanalCobranca) {
    setValor(next);
    if (onSelecionar) start(async () => void (await onSelecionar(next)));
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-cinza">Envio de honorários (nota + boleto)</span>
      <select
        name={name}
        value={valor}
        disabled={disabled || salvando}
        onChange={(e) => handleChange(e.target.value as CanalCobranca)}
        className={controleCls("compacto")}
      >
        {OPCOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {salvando && <span className="text-xs text-cinza">Salvando…</span>}
    </label>
  );
}
