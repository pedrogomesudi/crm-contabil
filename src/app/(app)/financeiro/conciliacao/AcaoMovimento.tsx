"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import type { MovimentoView } from "./actions";
import {
  candidatosDoMovimento,
  conciliarComBaixa,
  conciliarComTitulo,
  criarLancamento,
  ignorarMovimento,
  reabrirMovimento,
  type CandidatosView,
} from "./conciliar-actions";

type Opcao = { id: string; nome: string };

export function AcaoMovimento({
  mov,
  categorias,
  clientes,
  fornecedores,
  onDone,
}: {
  mov: MovimentoView;
  categorias: { id: string; nome: string }[];
  clientes: Opcao[];
  fornecedores: Opcao[];
  onDone: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [cand, setCand] = useState<CandidatosView | null>(null);
  const [lanc, setLanc] = useState(false);
  const [cat, setCat] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function abrir() {
    setAberto(true);
    setCand(await candidatosDoMovimento(mov.id));
  }
  async function acao(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) onDone();
    else setErro(r.erro ?? "Erro");
  }
  async function lancar() {
    setErro("");
    const credito = mov.valor > 0;
    await acao(() =>
      criarLancamento(mov.id, {
        categoriaId: cat,
        descricao: desc,
        clienteId: credito ? pessoa : undefined,
        fornecedorId: credito ? undefined : pessoa,
      }),
    );
  }

  if (mov.status !== "pendente") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-cinza">{mov.status}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => acao(() => reabrirMovimento(mov.id))}
          className="underline"
        >
          Reabrir
        </button>
        {erro && <span className="text-negativo">{erro}</span>}
      </span>
    );
  }

  const credito = mov.valor > 0;
  const pessoas = credito ? clientes : fornecedores;
  return (
    <span className="flex flex-col gap-1 text-xs">
      {!aberto && (
        <button type="button" onClick={abrir} className="w-fit rounded bg-verde px-2 py-0.5 font-medium text-white">
          Conciliar…
        </button>
      )}
      {aberto && cand && (
        <span className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-2">
          {cand.baixas.map((b) => (
            <button
              key={b.baixaId}
              type="button"
              disabled={busy}
              onClick={() => acao(() => conciliarComBaixa(mov.id, b.baixaId))}
              className="w-fit text-left text-verde underline"
            >
              ↔ baixa {b.clienteNome || "—"} · {b.data.slice(8, 10)}/{b.data.slice(5, 7)}
            </button>
          ))}
          {cand.titulos.map((t) => (
            <button
              key={t.tituloId}
              type="button"
              disabled={busy}
              onClick={() => acao(() => conciliarComTitulo(mov.id, t.tituloId))}
              className="w-fit text-left text-verde underline"
            >
              ↔ título {t.descricao || "—"} · saldo {formatarMoeda(t.saldo)}
              {t.parcial && <span className="ml-1 text-xs text-ambar">(pagamento parcial)</span>}
            </button>
          ))}
          {cand.baixas.length === 0 && cand.titulos.length === 0 && !lanc && (
            <span className="flex items-center gap-2">
              <span className="text-cinza">Sem correspondência.</span>
              <button type="button" onClick={() => setLanc(true)} className="text-verde underline">
                Criar lançamento
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => acao(() => ignorarMovimento(mov.id))}
                className="text-cinza underline"
              >
                Ignorar
              </button>
            </span>
          )}
          {lanc && (
            <span className="flex flex-col gap-1">
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={controleCls("compacto")}>
                <option value="">{credito ? "Cliente…" : "Fornecedor…"}</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className={controleCls("compacto")}>
                <option value="">Categoria…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                className={controleCls("compacto")}
              />
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={lancar}
                  className="rounded bg-verde px-2 py-0.5 font-medium text-white"
                >
                  Criar
                </button>
                <button type="button" onClick={() => setLanc(false)} className="text-cinza underline">
                  Cancelar
                </button>
              </span>
            </span>
          )}
          {erro && <span className="text-negativo">{erro}</span>}
          <button type="button" onClick={() => setAberto(false)} className="w-fit text-cinza underline">
            fechar
          </button>
        </span>
      )}
    </span>
  );
}
