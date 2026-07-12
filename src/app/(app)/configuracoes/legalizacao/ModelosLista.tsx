"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarModelo, type ModeloView } from "./actions";
import { LEGALIZACAO_TIPOS, rotuloTipo } from "@/lib/legalizacao/tipos";

export function ModelosLista({ modelos }: { modelos: ModeloView[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState(LEGALIZACAO_TIPOS[0]?.valor ?? "abertura_simples");
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (!nome.trim()) return;
    setOcupado(true);
    setErro(null);
    const r = await criarModelo({ tipo, nome, descricao: null });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.id) router.push(`/configuracoes/legalizacao/${r.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Modelo</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-right font-medium">Etapas</th>
              <th className="px-3 py-2 text-left font-medium">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {modelos.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-cinza">Nenhum modelo.</td></tr>
            ) : modelos.map((m) => (
              <tr key={m.id} className="border-b border-linha/60 hover:bg-creme">
                <td className="px-3 py-2"><Link href={`/configuracoes/legalizacao/${m.id}`} className="text-verde underline">{m.nome}</Link></td>
                <td className="px-3 py-2 text-cinza">{rotuloTipo(m.tipo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.etapas}</td>
                <td className="px-3 py-2">{m.ativo ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-creme p-3 text-sm">
        <h3 className="w-full font-display text-sm font-semibold text-texto">Novo modelo</h3>
        <label className="text-xs text-cinza">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            {LEGALIZACAO_TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs text-cinza">Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
        <button disabled={ocupado || !nome.trim()} onClick={criar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
          {ocupado ? "Criando…" : "Criar modelo"}
        </button>
        {erro && <span role="alert" className="w-full text-xs text-negativo">{erro}</span>}
      </div>
    </div>
  );
}
