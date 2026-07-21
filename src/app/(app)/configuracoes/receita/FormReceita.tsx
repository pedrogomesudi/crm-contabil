"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { salvarReceitaConfig, type ReceitaConfig } from "./actions";

export function FormReceita({ cfg }: { cfg: ReceitaConfig }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    const r = await salvarReceitaConfig(new FormData(e.currentTarget));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="size-4" />
        Reconsultar automaticamente a situação na Receita
      </label>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="badge" defaultChecked={cfg.badgeAtivo} className="size-4" />
        Mostrar contador de alertas no menu
      </label>
      <label className="block text-xs text-cinza">
        Frequência por cliente (dias entre reconsultas)
        <input
          type="number"
          name="frequencia"
          min={1}
          defaultValue={cfg.frequenciaDias}
          className={`${controleCls("compacto")} mt-0.5 block w-40`}
        />
      </label>
      <Botao type="submit" disabled={ocupado}>
        Salvar
      </Botao>
    </form>
  );
}
