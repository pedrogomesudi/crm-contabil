"use client";
import { useRef, useState } from "react";
import { listarClientesReceita, atualizarViaReceita } from "@/app/(app)/integracoes/dominio/receita";

type Linha = {
  cpf_cnpj: string;
  razao_social: string;
  marcado: boolean;
  status?: "processando" | "ok" | "erro";
  detalhe?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AtualizarPelaReceita() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, falha: 0 });
  const pararRef = useRef(false);

  async function carregar() {
    setCarregando(true);
    const lista = await listarClientesReceita();
    // Todos começam selecionados; o usuário desmarca o que não quiser.
    setLinhas(lista.map((c) => ({ cpf_cnpj: c.cpf_cnpj, razao_social: c.razao_social, marcado: true })));
    setCarregando(false);
  }

  function marcarTodos(marcar: boolean) {
    setLinhas((ls) => ls.map((l) => ({ ...l, marcado: marcar })));
  }
  function alternar(cpf: string) {
    setLinhas((ls) => ls.map((l) => (l.cpf_cnpj === cpf ? { ...l, marcado: !l.marcado } : l)));
  }

  async function executar() {
    const alvos = linhas.filter((l) => l.marcado);
    setExecutando(true);
    pararRef.current = false;
    setProg({ feitas: 0, total: alvos.length, ok: 0, falha: 0 });
    for (const alvo of alvos) {
      if (pararRef.current) break;
      setLinhas((ls) => ls.map((l) => (l.cpf_cnpj === alvo.cpf_cnpj ? { ...l, status: "processando" } : l)));
      const r = await atualizarViaReceita(alvo.cpf_cnpj);
      setLinhas((ls) =>
        ls.map((l) =>
          l.cpf_cnpj === alvo.cpf_cnpj
            ? {
                ...l,
                status: r.ok ? "ok" : "erro",
                razao_social: r.ok && r.razao ? r.razao : l.razao_social,
                detalhe: r.ok ? [r.razao, r.situacao].filter(Boolean).join(" · ") : r.erro,
              }
            : l,
        ),
      );
      setProg((p) => ({ feitas: p.feitas + 1, total: p.total, ok: p.ok + (r.ok ? 1 : 0), falha: p.falha + (r.ok ? 0 : 1) }));
      await sleep(250); // gentil com o limite de requisições da BrasilAPI
    }
    setExecutando(false);
  }

  const marcados = linhas.filter((l) => l.marcado).length;
  const todosMarcados = linhas.length > 0 && marcados === linhas.length;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4 text-sm">
      <div>
        <h2 className="text-sm font-semibold">Atualizar pela Receita Federal</h2>
        <p className="text-xs text-gray-600">
          Consulta cada <strong>CNPJ</strong> na Receita (via BrasilAPI, com fallback ReceitaWS) e atualiza{" "}
          <strong>razão social</strong> e <strong>endereço completo</strong>. Clientes com CPF são ignorados. Roda um a
          um, no navegador — marque quais atualizar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={carregar}
          disabled={carregando || executando}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-60"
        >
          {carregando ? "Carregando…" : "Carregar clientes (CNPJ)"}
        </button>
        {linhas.length > 0 && (
          <button
            onClick={executar}
            disabled={executando || marcados === 0}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-60"
          >
            {executando ? `Atualizando ${prog.feitas}/${prog.total}…` : `Atualizar ${marcados} selecionado(s)`}
          </button>
        )}
        {executando && (
          <button onClick={() => (pararRef.current = true)} className="rounded border border-slate-300 px-3 py-1">
            Parar
          </button>
        )}
        {prog.total > 0 && (
          <span>
            ✓ {prog.ok} · ✗ {prog.falha}
          </span>
        )}
      </div>

      {linhas.length > 0 && (
        <div className="max-h-96 overflow-auto rounded border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">
                  <input
                    type="checkbox"
                    aria-label="Marcar/desmarcar todos"
                    checked={todosMarcados}
                    disabled={executando}
                    onChange={(e) => marcarTodos(e.target.checked)}
                  />
                </th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.cpf_cnpj} className="border-t border-slate-100">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${l.razao_social}`}
                      checked={l.marcado}
                      disabled={executando}
                      onChange={() => alternar(l.cpf_cnpj)}
                    />
                  </td>
                  <td className="p-2">{l.razao_social}</td>
                  <td className="p-2">
                    {l.status === "processando" && <span className="text-slate-500">consultando…</span>}
                    {l.status === "ok" && <span className="text-green-700">✓ {l.detalhe}</span>}
                    {l.status === "erro" && <span className="text-red-600">✗ {l.detalhe}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
