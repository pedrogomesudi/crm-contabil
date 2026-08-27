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
import {
  listarBoletosDaCompetencia,
  sincronizarBoletosInter,
  cancelarTitulo,
  emitirBoleto,
  emitirBoletoGrupo,
  type BoletoView,
} from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { podeCancelarTitulo } from "@/lib/boleto/cancelamento";
import { BoletoTitulo } from "./BoletoTitulo";
import { AlterarVencimentoTitulo } from "./AlterarVencimentoTitulo";
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
  const [filtro, setFiltro] = useState<"TODOS" | "ABERTO" | "RECEBIDO" | "CANCELADO" | "VENCIDO">("TODOS");
  const [busca, setBusca] = useState("");
  const [pend, start] = useTransition();
  const competencia = mes ? `${mes}-01` : "";

  // Status derivado por título (VENCIDO não é persistido — é vencimento no passado com saldo),
  // o mesmo mostrado no badge; o filtro casa exatamente com esses rótulos.
  const linhas = titulos.map((t) => {
    const saldo = saldoTitulo(t.valor, t.somaBaixado);
    const status = ehVencido(t.vencimento, t.status, saldo) ? "VENCIDO" : t.status;
    return { t, saldo, status };
  });
  const casaFiltro = (status: string) =>
    filtro === "TODOS" ||
    (filtro === "ABERTO" && status === "ABERTO") ||
    (filtro === "RECEBIDO" && (status === "BAIXADO" || status === "BAIXADO_PARCIAL")) ||
    (filtro === "CANCELADO" && status === "CANCELADO") ||
    (filtro === "VENCIDO" && status === "VENCIDO");
  const q = busca.trim().toLowerCase();
  const visiveis = linhas.filter((l) => casaFiltro(l.status) && (!q || l.t.cliente.toLowerCase().includes(q)));
  const FILTROS: { chave: typeof filtro; rotulo: string }[] = [
    { chave: "TODOS", rotulo: "Todos" },
    { chave: "ABERTO", rotulo: "Em aberto" },
    { chave: "RECEBIDO", rotulo: "Recebido" },
    { chave: "VENCIDO", rotulo: "Vencido" },
    { chave: "CANCELADO", rotulo: "Cancelado" },
  ];

  const abrirAvulsa = () =>
    start(async () => {
      if (clientesAv.length === 0) setClientesAv(await listarClientesAtivos());
      if (categoriasAv.length === 0) setCategoriasAv(await listarCategoriasReceita());
      setAvulsaAberta(true);
    });

  const sincronizar = () =>
    start(async () => {
      const r = await sincronizarBoletosInter();
      setMsg(r.erro ?? `${r.baixados ?? 0} boleto(s) baixado(s).`);
      if (!r.erro && competencia) {
        setTitulos(await listarTitulos(competencia));
        setBoletos(await listarBoletosDaCompetencia(competencia));
      }
    });

  // Emite boleto para todos os títulos em aberto que ainda não têm boleto, um a um
  // (cada um é uma chamada ao Inter). Pula os que já têm e reporta os que falham, sem
  // travar o lote. Mesmo padrão da emissão de NFS-e em lote.
  const gerarBoletosLote = () =>
    start(async () => {
      const emAberto = (t: TituloView) => t.status !== "BAIXADO" && t.status !== "CANCELADO";
      // Individuais: sem grupo e sem "Não enviar" (o boleto desses é manual).
      const alvos = titulos.filter((t) => emAberto(t) && !t.naoEnvia && !t.grupoCobrancaId && !boletos[t.id]);
      // Grupos: um boleto consolidado por grupo (na titular).
      const grupos = [
        ...new Set(titulos.filter((t) => emAberto(t) && t.grupoCobrancaId).map((t) => t.grupoCobrancaId!)),
      ];
      if (alvos.length === 0 && grupos.length === 0) {
        setMsg("Nenhum título em aberto sem boleto nesta competência.");
        return;
      }
      let ok = 0;
      const erros: string[] = [];
      for (const g of grupos) {
        setMsg("Emitindo boleto(s) de grupo…");
        const r = await emitirBoletoGrupo(g, competencia);
        if (r.erro) erros.push(`Grupo: ${r.erro}`);
        else if (r.ok) ok++;
      }
      for (let i = 0; i < alvos.length; i++) {
        setMsg(`Emitindo boletos… ${i + 1}/${alvos.length}`);
        const r = await emitirBoleto(alvos[i]!.id);
        if (r.erro) erros.push(`${alvos[i]!.cliente}: ${r.erro}`);
        else ok++;
      }
      setBoletos(await listarBoletosDaCompetencia(competencia));
      const resumoErros = erros.length
        ? ` · ${erros.length} com erro (${erros.slice(0, 3).join("; ")}${erros.length > 3 ? "…" : ""})`
        : "";
      setMsg(`${ok} boleto(s) emitido(s)${resumoErros}.`);
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
      <div className="flex flex-wrap gap-2">
        <button
          onClick={abrirAvulsa}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Nova cobrança avulsa
        </button>
        <button
          onClick={sincronizar}
          disabled={pend}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          Sincronizar boletos pagos (Inter)
        </button>
        <button
          onClick={gerarBoletosLote}
          disabled={pend || titulos.length === 0}
          className="rounded-lg bg-verde px-3 py-1 font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          Gerar boletos em lote
        </button>
      </div>
      {avulsaAberta && (
        <NovaCobrancaAvulsa
          clientes={clientesAv}
          categorias={categoriasAv}
          competenciaInicial={mes}
          onCriado={aposCriarAvulsa}
        />
      )}
      {msg && <p className="text-cinza">{msg}</p>}

      {titulos.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.chave}
                type="button"
                onClick={() => setFiltro(f.chave)}
                className={`rounded-full border px-3 py-0.5 text-xs ${
                  filtro === f.chave
                    ? "border-verde bg-verde text-white"
                    : "border-linha text-cinza hover:border-cinza-claro"
                }`}
              >
                {f.rotulo}
              </button>
            ))}
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente"
              className={`${controleCls("compacto")} ml-1`}
            />
            <span className="ml-1 text-xs text-cinza">
              {visiveis.length} de {titulos.length}
            </span>
          </div>
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
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-3 text-cinza">
                      Nenhum título com esse status nesta competência.
                    </td>
                  </tr>
                )}
                {visiveis.map(({ t, saldo, status }) => (
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
                      {podeCancelarTitulo(status, t.somaBaixado) && (
                        <button
                          type="button"
                          className="ml-2 text-negativo underline"
                          onClick={() =>
                            start(async () => {
                              const motivo = prompt("Motivo do cancelamento do título?") ?? "";
                              if (motivo.trim().length < 3) return;
                              const r = await cancelarTitulo(t.id, motivo);
                              setMsg(r.erro ?? "Título cancelado.");
                              if (!r.erro) {
                                setTitulos(await listarTitulos(competencia));
                                setBoletos(await listarBoletosDaCompetencia(competencia));
                              }
                            })
                          }
                        >
                          Cancelar
                        </button>
                      )}
                      {podeCancelarTitulo(status, t.somaBaixado) && (
                        <AlterarVencimentoTitulo
                          tituloId={t.id}
                          vencimento={t.vencimento}
                          onMudou={() =>
                            start(async () => {
                              setTitulos(await listarTitulos(competencia));
                              setBoletos(await listarBoletosDaCompetencia(competencia));
                            })
                          }
                        />
                      )}
                      <div className="mt-1">
                        {t.grupoCobrancaId ? (
                          <span className="text-xs text-cinza">Boleto consolidado no grupo (titular)</span>
                        ) : (
                          <BoletoTitulo
                            tituloId={t.id}
                            boleto={boletos[t.id] ?? null}
                            onMudou={() => start(async () => setBoletos(await listarBoletosDaCompetencia(competencia)))}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {baixando && (
        // Modal: aparece no centro da tela em vez de no rodapé (a lista tem ~150 linhas;
        // renderizar o form embaixo dela fazia o clique em "Baixar" parecer sem efeito).
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
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
            className="w-full max-w-xl space-y-2 rounded-lg border border-linha bg-white p-4 shadow-flutuante"
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
        </div>
      )}
    </div>
  );
}
