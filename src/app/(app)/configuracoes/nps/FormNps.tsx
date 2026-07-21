"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { salvarNps, type NpsConfig } from "./actions";

export function FormNps({ cfg }: { cfg: NpsConfig }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    const r = await salvarNps(new FormData(e.currentTarget));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-linha bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="size-4" />
        Coletar NPS no portal do cliente
      </label>
      <label className="block text-xs text-cinza">
        Periodicidade (dias entre pesquisas do mesmo cliente)
        <input
          type="number"
          name="periodicidade"
          min={1}
          defaultValue={cfg.periodicidadeDias}
          className={`${controleCls("compacto")} mt-0.5 block w-40`}
        />
      </label>
      <label className="block text-xs text-cinza">
        Pergunta (opcional — vazio usa o texto padrão)
        <input
          type="text"
          name="pergunta"
          defaultValue={cfg.pergunta}
          maxLength={300}
          placeholder="De 0 a 10, quanto você recomendaria nosso escritório a um colega?"
          className={`${controleCls("compacto")} mt-0.5 block w-full`}
        />
      </label>
      <Botao type="submit" disabled={ocupado}>
        Salvar
      </Botao>
    </form>
  );
}
