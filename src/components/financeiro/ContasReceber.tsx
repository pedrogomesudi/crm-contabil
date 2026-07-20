"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState, useTransition } from "react";
import {
  listarTitulos,
  gerarMensalidades,
  registrarBaixa,
  setAutomacao,
  listarClientesAtivos,
  listarCategoriasReceita,
  type TituloView,
} from "@/app/(app)/financeiro/contas-a-receber/actions";
import { NovaCobrancaAvulsa } from "./NovaCobrancaAvulsa";
import { estornarBaixaDoTitulo } from "@/app/(app)/financeiro/contas-a-pagar/actions";
import { cobrarViaWhatsapp } from "@/app/(app)/financeiro/contas-a-receber/whatsapp";
import { listarBoletosDaCompetencia, type BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { BoletoTitulo } from "./BoletoTitulo";
import { saldoTitulo, ehVencido, LABEL_STATUS } from "@/lib/financeiro/titulos";
import { Badge } from "@/components/ui/Badge";
import { badgeStatusTitulo } from "@/lib/ui/apresentacao";
import { formatarMoeda, formatarData } from "@/lib/format";
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";

export function ContasReceber({
  contas,
  automacaoInicial,
}: {
  contas: { id: string; nome: string }[];
  automacaoInicial: boolean;
}) {
  // Faturamento em regime vencido: a competência corrente é o mês anterior.
  const [mes, setMes] = useState(mesAnteriorDeHoje());
  const [titulos, setTitulos] = useState<TituloView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [auto, setAuto] = useState(automacaoInicial);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [boletos, setBoletos] = useState<Record<string, BoletoView>>({});
  const [avulsaAberta, setAvulsaAberta] = useState(false);
  const [clientesAv, setClientesAv] = useState<{ id: string; nome: string }[]>([]);
  const [categoriasAv, setCategoriasAv] = useState<{ id: string; nome: string }[]>([]);
  const [pend, start] = useTransition();
  const competencia = mes ? `${mes}-01` : "";

  const abrirAvulsa = () =>
    start(async () => {
      if (clientesAv.length === 0) setClientesAv(await listarClientesAtivos());
      if (categoriasAv.length === 0) setCategoriasAv(await listarCategoriasReceita());
      setAvulsaAberta(true);
    });

  const aposCriarAvulsa = (competenciaNova: string) => {
    setAvulsaAberta(false);
    setMes(competenciaNova.slice(0, 7));
    start(async () => {
      setTitulos(await listarTitulos(competenciaNova));
      setBoletos(await listarBoletosDaCompetencia(competenciaNova));
    });
  };

  const carregar = () =>
    start(async () => {
      if (competencia) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
    });
  const gerar = () =>
    start(async () => {
      const r = await gerarMensalidades(competencia);
      setMsg(r.erro ?? `Geradas ${r.gerados}, puladas ${r.pulados}.`);
      if (!r.erro) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
    });

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label>
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={`${controleCls("compacto")} ml-2`}
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
          Gerar mensalidades do mês
        </button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              start(() => setAutomacao(e.target.checked));
            }}
          />
          Gerar automaticamente todo mês
        </label>
      </div>
      <div>
        <button
          onClick={abrirAvulsa}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Nova cobrança avulsa
        </button>
      </div>
      {avulsaAberta && (
        <NovaCobrancaAvulsa clientes={clientesAv} categorias={categoriasAv} onCriado={aposCriarAvulsa} />
      )}
      {msg && <p className="text-cinza">{msg}</p>}

      {titulos.length > 0 && (
        <div className="overflow-auto rounded border border-linha">
          <table className="w-full">
            <thead className="bg-creme text-left">
              <tr>
                <th className="p-2">Cliente</th>
                <th className="p-2">Origem</th>
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
                const status = ehVencido(t.vencimento, t.status, saldo) ? "VENCIDO" : t.status;
                return (
                  <tr key={t.id} className="border-t border-linha/70">
                    <td className="p-2">{t.cliente}</td>
                    <td className="p-2">
                      {t.origem === "DECIMO_TERCEIRO"
                        ? "13º"
                        : t.origem === "RECEITA_AVULSA"
                          ? "Avulsa"
                          : "Mensalidade"}
                    </td>
                    <td className="p-2">{formatarData(t.vencimento)}</td>
                    <td className="p-2">{formatarMoeda(t.valor)}</td>
                    <td className="p-2">{formatarMoeda(saldo)}</td>
                    <td className="p-2">
                      <Badge variante={badgeStatusTitulo(status)}>{LABEL_STATUS[status] ?? status}</Badge>
                    </td>
                    <td className="p-2 text-right">
                      {t.somaBaixado > 0 ? (
                        <button
                          type="button"
                          className="text-cinza underline"
                          onClick={() =>
                            start(async () => {
                              const motivo = prompt("Justificativa do estorno?") ?? "";
                              if (motivo.trim().length < 3) return;
                              const r = await estornarBaixaDoTitulo(t.id, motivo);
                              if (!r.erro) setTitulos(await listarTitulos(competencia));
                            })
                          }
                        >
                          Estornar
                        </button>
                      ) : (
                        <button type="button" className="text-blue-600 underline" onClick={() => setBaixando(t.id)}>
                          Baixar
                        </button>
                      )}
                      {t.temTelefone && saldo > 0 && (
                        <button
                          type="button"
                          className="ml-2 text-verde underline"
                          onClick={() =>
                            start(async () => {
                              const r = await cobrarViaWhatsapp(t.id);
                              setMsg(r.erro ?? "Cobrança enviada por WhatsApp.");
                            })
                          }
                        >
                          Cobrar (WhatsApp)
                        </button>
                      )}
                      <div className="mt-1">
                        <BoletoTitulo
                          tituloId={t.id}
                          boleto={boletos[t.id] ?? null}
                          onMudou={() => start(async () => setBoletos(await listarBoletosDaCompetencia(competencia)))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {baixando && (
        <form
          action={async (fd) => {
            fd.set("titulo_id", baixando);
            const r = await registrarBaixa(fd);
            setMsg(r.erro ?? "Baixa registrada.");
            if (!r.erro) {
              setBaixando(null);
              start(async () => setTitulos(await listarTitulos(competencia)));
            }
          }}
          className="max-w-xl space-y-2 rounded border border-linha p-3"
        >
          <p className="text-sm font-medium">Registrar baixa</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="valor_recebido"
              type="number"
              step="0.01"
              placeholder="Valor recebido"
              required
              className={controleCls()}
            />
            <input name="data_recebimento" type="date" required className={controleCls()} />
            <select name="conta_bancaria_id" required className={controleCls()}>
              <option value="">Conta bancária…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select name="forma_pagamento" required className={controleCls()}>
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
              Confirmar baixa
            </button>
            <button type="button" onClick={() => setBaixando(null)} className="rounded border border-linha px-3 py-2">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
