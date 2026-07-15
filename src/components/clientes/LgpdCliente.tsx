"use client";
import { useState } from "react";
import { baixarBase64 } from "@/lib/lgpd/tipos";
import { gerarRelatorioTitular, anonimizarTitular } from "@/app/(app)/lgpd/actions";

export function LgpdCliente({ clienteId }: { clienteId: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function baixar(formato: "pdf" | "json") {
    setOcupado(true);
    setMsg(null);
    const r = await gerarRelatorioTitular(clienteId, formato);
    setOcupado(false);
    if (r.erro || !r.base64) return setMsg(r.erro ?? "Falha ao gerar.");
    baixarBase64(r.base64, r.nome ?? "relatorio", r.mime ?? "application/octet-stream");
  }

  async function anonimizar() {
    // Anonimização é IRREVERSÍVEL — confirmação explícita, e o servidor exige confirmar:true.
    if (!confirm("Anonimizar os dados pessoais deste titular? É IRREVERSÍVEL. Os dados fiscais sob guarda legal são mantidos.")) return;
    setOcupado(true);
    setMsg(null);
    const r = await anonimizarTitular(clienteId, true);
    setOcupado(false);
    if (r.erro) return setMsg(r.erro);
    if (r.base64) baixarBase64(r.base64, r.nome ?? "exclusao", r.mime ?? "application/octet-stream");
    setMsg("Anonimização concluída. A resposta documentada foi baixada.");
  }

  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <h2 className="font-display text-sm font-semibold text-texto">LGPD</h2>
      <p className="text-xs text-cinza">
        Direito de acesso e portabilidade (relatório) e direito de exclusão (anonimização que respeita a
        guarda fiscal).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={ocupado} onClick={() => baixar("pdf")} className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60">
          Relatório de dados (PDF)
        </button>
        <button disabled={ocupado} onClick={() => baixar("json")} className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60">
          Portabilidade (JSON)
        </button>
        <button disabled={ocupado} onClick={anonimizar} className="rounded-lg border border-negativo px-3 py-1.5 text-negativo disabled:opacity-60">
          Anonimizar titular
        </button>
      </div>
      {msg && <p className="text-xs text-cinza">{msg}</p>}
    </section>
  );
}
