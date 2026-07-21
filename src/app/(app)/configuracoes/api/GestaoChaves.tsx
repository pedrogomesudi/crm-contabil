"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { formatarData } from "@/lib/format";
import { ESCOPOS_API } from "@/lib/api/escopos";
import { criarApiKey, revogarApiKey, type ApiKeyView } from "./actions";

export function GestaoChaves({ chaves }: { chaves: ApiKeyView[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<string[]>([]);
  const [criada, setCriada] = useState<string | null>(null);

  function toggle(e: string) {
    setEscopos((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]));
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    const r = await criarApiKey(nome, escopos);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setCriada(r.chave ?? null);
    setNome("");
    setEscopos([]);
    router.refresh();
  }

  async function revogar(id: string) {
    if (!confirm("Revogar esta chave? Integrações que a usam param de funcionar.")) return;
    const r = await revogarApiKey(id);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {criada && (
        <div className="rounded-2xl border border-verde/40 bg-creme p-4 text-sm">
          <p className="font-medium text-texto">Chave criada — copie agora, ela não será mostrada de novo:</p>
          <code className="mt-2 block break-all rounded-lg bg-white p-2 text-texto">{criada}</code>
          <button type="button" onClick={() => setCriada(null)} className="mt-2 text-xs text-cinza underline">
            Já copiei, ocultar
          </button>
        </div>
      )}

      <form onSubmit={criar} className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-texto">Nova chave</h2>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Integração ERP)"
          className={`${controleCls("compacto")} block w-full`}
        />
        <div className="flex flex-wrap gap-2">
          {ESCOPOS_API.map((e) => (
            <label key={e} className="flex items-center gap-1.5 text-xs text-texto">
              <input type="checkbox" checked={escopos.includes(e)} onChange={() => toggle(e)} className="size-4" />
              {e}
            </label>
          ))}
        </div>
        <Botao type="submit" disabled={ocupado}>
          Criar chave
        </Botao>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Prefixo</th>
              <th className="px-3 py-2 text-left font-medium">Escopos</th>
              <th className="px-3 py-2 text-right font-medium">Último uso</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {chaves.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-cinza">
                  Nenhuma chave.
                </td>
              </tr>
            ) : (
              chaves.map((k) => (
                <tr key={k.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{k.nome}</td>
                  <td className="px-3 py-2 font-mono text-cinza">{k.prefixo}…</td>
                  <td className="px-3 py-2 text-xs text-cinza">{k.escopos.join(", ")}</td>
                  <td className="px-3 py-2 text-right text-cinza">{k.ultimoUso ? formatarData(k.ultimoUso) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {k.revogadaEm ? (
                      <span className="text-xs text-cinza">revogada</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => revogar(k.id)}
                        className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-negativo hover:bg-creme"
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
