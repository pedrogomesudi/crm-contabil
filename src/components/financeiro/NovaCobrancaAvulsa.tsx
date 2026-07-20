"use client";
import { useState } from "react";
import { controleCls } from "@/components/ui/Campo";
import { criarCobrancaAvulsa } from "@/app/(app)/financeiro/contas-a-receber/actions";
import { competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";

type Opcao = { id: string; nome: string };

export function NovaCobrancaAvulsa({
  clientes,
  categorias,
  onCriado,
}: {
  clientes: Opcao[];
  categorias: Opcao[];
  onCriado: (competencia: string) => void;
}) {
  const [cliente, setCliente] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [categoria, setCategoria] = useState("");
  const [emitir, setEmitir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function salvar() {
    setMsg("");
    setBusy(true);
    const r = await criarCobrancaAvulsa(
      { clienteId: cliente, valor: Number(valor), vencimento, categoriaId: categoria, descricao },
      emitir,
    );
    setBusy(false);
    if ("erro" in r) {
      setMsg(r.erro);
      return;
    }
    if (r.avisoBoleto) setMsg(`Cobrança criada, mas o boleto falhou: ${r.avisoBoleto}`);
    onCriado(competenciaDoVencimento(vencimento));
    setDescricao("");
    setValor("");
    setVencimento("");
    setCategoria("");
    setEmitir(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-linha bg-white p-3">
      <h2 className="text-sm font-semibold text-grafite">Nova cobrança avulsa</h2>
      <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={controleCls("compacto")}>
        <option value="">Cliente…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Descrição"
        className={controleCls("compacto")}
      />
      <div className="flex gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          type="number"
          step="0.01"
          min="0"
          placeholder="Valor (R$)"
          className={controleCls("compacto")}
        />
        <input
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          type="date"
          className={controleCls("compacto")}
        />
      </div>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={controleCls("compacto")}>
        <option value="">Categoria…</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} />
        Emitir boleto agora
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={salvar}
          className="rounded-lg bg-verde px-3 py-1 font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          Criar cobrança
        </button>
        {msg && <span className="text-cinza">{msg}</span>}
      </div>
    </div>
  );
}
