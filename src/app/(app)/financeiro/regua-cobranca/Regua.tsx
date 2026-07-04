"use client";
import { useState, useTransition } from "react";
import {
  salvarEtapa, setReguaAtiva, dispararReguaManual, type EtapaView, type EnvioView,
} from "./actions";

export function Regua({
  ativaInicial, etapas, historico,
}: {
  ativaInicial: boolean;
  etapas: EtapaView[];
  historico: EnvioView[];
}) {
  const [ativa, setAtiva] = useState(ativaInicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const r = await setReguaAtiva(!ativa);
      if (!r.erro) setAtiva(!ativa);
    });
  const processar = () =>
    start(async () => {
      const r = await dispararReguaManual();
      setMsg(
        r.erro ??
          (r.resumo
            ? `Processados ${r.resumo.processados}, enviados ${r.resumo.enviados}, pulados ${r.resumo.pulados}, erros ${r.resumo.erros}. ${r.resumo.motivo ?? ""}`
            : ""),
      );
    });

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ativa} onChange={toggle} disabled={pend} />
          Régua automática {ativa ? "ativa" : "desligada"}
        </label>
        <button onClick={processar} disabled={pend} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60">
          Processar agora
        </button>
      </div>
      {msg && <p className="text-slate-700">{msg}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Etapas</h2>
        {etapas.map((e) => (
          <form
            key={e.id}
            action={async (fd) => {
              fd.set("id", e.id);
              const r = await salvarEtapa(fd);
              setMsg(r.erro ?? "Etapa salva.");
            }}
            className="grid grid-cols-[1fr_5rem_1fr_4rem_auto] items-center gap-2 rounded border border-slate-200 p-2"
          >
            <input name="nome" defaultValue={e.nome} className="rounded border border-slate-300 p-1" />
            <input name="dias_offset" type="number" defaultValue={e.dias_offset} className="rounded border border-slate-300 p-1" title="dias (negativo=antes)" />
            <input name="template" defaultValue={e.template} className="rounded border border-slate-300 p-1" />
            <label className="flex items-center gap-1"><input type="checkbox" name="ativa" defaultChecked={e.ativa} /> ativa</label>
            <input type="hidden" name="ordem" defaultValue={e.ordem} />
            <button type="submit" className="rounded border border-slate-300 px-2 py-1">Salvar</button>
          </form>
        ))}
        <form
          action={async (fd) => {
            const r = await salvarEtapa(fd);
            setMsg(r.erro ?? "Etapa criada.");
          }}
          className="grid grid-cols-[1fr_5rem_1fr_4rem_auto] items-center gap-2 rounded border border-dashed border-slate-300 p-2"
        >
          <input name="nome" placeholder="Nova etapa" className="rounded border border-slate-300 p-1" />
          <input name="dias_offset" type="number" placeholder="dias" className="rounded border border-slate-300 p-1" />
          <input name="template" placeholder="Mensagem com {nome} {valor} {vencimento} {dias}" className="rounded border border-slate-300 p-1" />
          <label className="flex items-center gap-1"><input type="checkbox" name="ativa" defaultChecked /> ativa</label>
          <input type="hidden" name="ordem" defaultValue={etapas.length + 1} />
          <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-white">Adicionar</button>
        </form>
        <p className="text-xs text-slate-500">
          Variáveis: {"{nome}"}, {"{valor}"}, {"{vencimento}"}, {"{dias}"}. Deslocamento negativo = antes do vencimento.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Últimos envios da régua</h2>
        <table className="w-full">
          <tbody>
            {historico.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="py-1">{h.cliente}</td>
                <td className="py-1">{h.etapa}</td>
                <td className="py-1">{h.status}</td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr>
                <td className="py-1 text-slate-400">Nenhum envio ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
