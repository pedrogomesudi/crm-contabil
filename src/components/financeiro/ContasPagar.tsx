"use client";
import { Badge } from "@/components/ui/Badge";
import { badgeStatusTitulo } from "@/lib/ui/apresentacao";
import { useState, useTransition } from "react";
import {
  listarTitulosPagar,
  lancarDespesa,
  gerarDespesasRecorrentes,
  registrarPagamento,
  type TituloPagar,
} from "@/app/(app)/financeiro/contas-a-pagar/actions";
import { saldoTitulo } from "@/lib/financeiro/titulos";
import { formatarMoeda, formatarData } from "@/lib/format";

export function ContasPagar({
  contas,
  fornecedores,
  categorias,
}: {
  contas: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
}) {
  const [mes, setMes] = useState("");
  const [titulos, setTitulos] = useState<TituloPagar[]>([]);
  const [modo, setModo] = useState("unica");
  const [pagando, setPagando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const competencia = mes ? `${mes}-01` : "";

  const carregar = () =>
    start(async () => {
      if (competencia) setTitulos(await listarTitulosPagar(competencia));
    });
  const gerar = () =>
    start(async () => {
      const r = await gerarDespesasRecorrentes(competencia);
      setMsg(r.erro ?? `Geradas ${r.gerados}, puladas ${r.pulados}.`);
      if (!r.erro) setTitulos(await listarTitulosPagar(competencia));
    });

  return (
    <div className="space-y-4 text-sm">
      <form
        action={async (fd) => {
          const r = await lancarDespesa(fd);
          setMsg(r.erro ?? "Despesa lançada.");
          if (!r.erro && competencia) start(async () => setTitulos(await listarTitulosPagar(competencia)));
        }}
        className="space-y-2 rounded-lg border border-linha bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Lançar despesa</h2>
        <div className="flex gap-3">
          {["unica", "parcelada", "recorrente"].map((m) => (
            <label key={m} className="flex items-center gap-1">
              <input type="radio" name="modo" value={m} checked={modo === m} onChange={() => setModo(m)} /> {m}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="descricao" placeholder="Descrição" required className="rounded border border-linha p-2" />
          <select name="fornecedor_id" required className="rounded border border-linha p-2">
            <option value="">Fornecedor…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          <select name="categoria_id" className="rounded border border-linha p-2">
            <option value="">Categoria (despesa)…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input
            name="valor"
            type="number"
            step="0.01"
            placeholder="Valor total"
            required
            className="rounded border border-linha p-2"
          />
          {modo !== "recorrente" ? (
            <input name="vencimento" type="date" required className="rounded border border-linha p-2" />
          ) : (
            <input
              name="dia_vencimento"
              type="number"
              min={1}
              max={28}
              placeholder="Dia venc. (1–28)"
              required
              className="rounded border border-linha p-2"
            />
          )}
          {modo === "parcelada" && (
            <input
              name="total_parcelas"
              type="number"
              min={2}
              placeholder="Nº de parcelas"
              required
              className="rounded border border-linha p-2"
            />
          )}
        </div>
        <button
          type="submit"
          className="rounded-lg bg-verde px-3 py-2 text-sm font-medium text-white hover:brightness-105"
        >
          Lançar
        </button>
      </form>

      <div className="flex flex-wrap items-end gap-2">
        <label>
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="ml-2 rounded border border-linha px-2 py-1"
          />
        </label>
        <button
          onClick={carregar}
          disabled={!competencia || pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Carregar
        </button>
        <button
          onClick={gerar}
          disabled={!competencia || pend}
          className="rounded-lg bg-verde px-3 py-1 font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          Gerar despesas do mês
        </button>
      </div>
      {msg && <p className="text-cinza">{msg}</p>}

      {titulos.length > 0 && (
        <div className="overflow-auto rounded border border-linha">
          <table className="w-full">
            <thead className="bg-creme text-left">
              <tr>
                <th className="p-2">Fornecedor</th>
                <th className="p-2">Descrição</th>
                <th className="p-2">Vencimento</th>
                <th className="p-2">Valor</th>
                <th className="p-2">Saldo</th>
                <th className="p-2">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => {
                const saldo = saldoTitulo(t.valor, t.somaBaixado);
                return (
                  <tr key={t.id} className="border-t border-linha/70">
                    <td className="p-2">{t.fornecedor}</td>
                    <td className="p-2">{t.descricao}</td>
                    <td className="p-2">{formatarData(t.vencimento)}</td>
                    <td className="p-2">{formatarMoeda(t.valor)}</td>
                    <td className="p-2">{formatarMoeda(saldo)}</td>
                    <td className="p-2">
                      <Badge variante={badgeStatusTitulo(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="p-2 text-right">
                      {saldo > 0 ? (
                        <button type="button" className="text-blue-600 underline" onClick={() => setPagando(t.id)}>
                          Pagar
                        </button>
                      ) : (
                        <span className="text-cinza-claro">pago</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagando && (
        <form
          action={async (fd) => {
            fd.set("titulo_id", pagando);
            const r = await registrarPagamento(fd);
            setMsg(r.erro ?? "Pagamento registrado.");
            if (!r.erro) {
              setPagando(null);
              start(async () => setTitulos(await listarTitulosPagar(competencia)));
            }
          }}
          className="max-w-xl space-y-2 rounded border border-linha p-3"
        >
          <p className="text-sm font-medium">Registrar pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="valor_recebido"
              type="number"
              step="0.01"
              placeholder="Valor pago"
              required
              className="rounded border border-linha p-2"
            />
            <input name="data_recebimento" type="date" required className="rounded border border-linha p-2" />
            <select name="conta_bancaria_id" required className="rounded border border-linha p-2">
              <option value="">Conta de saída…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select name="forma_pagamento" required className="rounded border border-linha p-2">
              {["PIX", "BOLETO", "CARTAO", "TRANSFERENCIA", "DINHEIRO"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-verde px-3 py-2 text-sm font-medium text-white hover:brightness-105"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setPagando(null)} className="rounded border border-linha px-3 py-2">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
