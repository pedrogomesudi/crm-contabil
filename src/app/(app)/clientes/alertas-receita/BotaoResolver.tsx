"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolverAlertaReceita } from "./actions";

export function BotaoResolver({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        const r = await resolverAlertaReceita(id);
        setOcupado(false);
        if (r?.erro) return alert(r.erro);
        router.refresh();
      }}
      className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto hover:bg-creme disabled:opacity-50"
    >
      Resolver
    </button>
  );
}
