"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { gerarRetroativo } from "./actions";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function GerarRetroativo({
  clienteId,
  anoAtual,
  onDone,
}: {
  clienteId?: string;
  anoAtual: number;
  onDone: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function gerar() {
    setBusy(true);
    setMsg("");
    const r = await gerarRetroativo(ano, mes, clienteId);
    setBusy(false);
    if (r) {
      setMsg(`${r.meses} mês(es) processado(s).`);
      setAberto(false);
      onDone();
    } else setMsg("Sem permissão.");
  }
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const inp = controleCls("compacto");
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="rounded-lg border border-linha px-3 py-1.5 text-sm"
      >
        Gerar retroativo
      </button>
      {aberto && (
        <span className="flex items-center gap-1">
          <span className="text-xs text-cinza">de</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inp}>
            {MES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={inp}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={gerar}
            className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white"
          >
            Gerar até hoje
          </button>
        </span>
      )}
      {msg && <span className="text-xs text-cinza">{msg}</span>}
    </span>
  );
}
