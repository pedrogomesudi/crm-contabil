"use client";
import { useState } from "react";
import { classificarAlerta } from "@/lib/onboarding/alertas";
import { listarInstancias, gerarCompetencia, type InstanciaView } from "./actions";
import { AcoesInstancia } from "./AcoesInstancia";
import { GerarRetroativo } from "./GerarRetroativo";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const rotuloComp = (iso: string, per: string) => {
  const a = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (per === "anual") return a;
  if (per === "trimestral") return `${Math.floor((m - 1) / 3) + 1}º tri/${a}`;
  return `${String(m).padStart(2, "0")}/${a}`;
};
const SELO: Record<string, string> = {
  em_breve: "bg-creme text-texto",
  vencido: "bg-negativo/10 text-negativo",
  critico: "bg-negativo text-white",
};

export function Calendario({
  ano: anoIni,
  mes: mesIni,
  instancias: iniList,
  podeGerar,
}: {
  ano: number;
  mes: number;
  instancias: InstanciaView[];
  podeGerar: boolean;
}) {
  const [ano, setAno] = useState(anoIni);
  const [mes, setMes] = useState(mesIni);
  const [lista, setLista] = useState<InstanciaView[]>(iniList);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anos = Array.from({ length: 5 }, (_, i) => anoIni + 1 - i);

  async function recarregar(a: number, m: number) {
    setAno(a);
    setMes(m);
    setCarregando(true);
    setLista(await listarInstancias(a, m));
    setCarregando(false);
  }
  async function gerar() {
    setCarregando(true);
    await gerarCompetencia(ano, mes);
    await recarregar(ano, mes);
  }

  const q = busca.trim().toLowerCase();
  const filtradas = lista.filter(
    (r) =>
      (!q || r.clienteNome.toLowerCase().includes(q) || r.obrigacaoNome.toLowerCase().includes(q)) &&
      (!status || r.status === status) &&
      (!soMeus || r.meu),
  );
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  const cont = { pendente: 0, entregue: 0, dispensada: 0 } as Record<string, number>;
  for (const r of filtradas) cont[r.status] = (cont[r.status] ?? 0) + 1;
  const resumoStatus = [
    cont.pendente ? plural(cont.pendente, "pendente") : null,
    cont.entregue ? plural(cont.entregue, "entregue") : null,
    cont.dispensada ? plural(cont.dispensada, "dispensada") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mes} onChange={(e) => recarregar(ano, Number(e.target.value))} className={inp}>
          {MES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={ano} onChange={(e) => recarregar(Number(e.target.value), mes)} className={inp}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp}>
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="entregue">Entregue</option>
          <option value="dispensada">Dispensada</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />
          só os meus
        </label>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente/obrigação"
          className={inp}
        />
        <a href="/obrigacoes/riscos" className="ml-auto rounded-lg border border-linha px-3 py-1.5 text-sm">
          Ver riscos
        </a>
        <a href="/obrigacoes/escalonamento" className="rounded-lg border border-linha px-3 py-1.5 text-sm">
          Escalonamento
        </a>
        <a href="/obrigacoes/conformidade" className="rounded-lg border border-linha px-3 py-1.5 text-sm">
          Conformidade
        </a>
        {podeGerar && (
          <button
            type="button"
            onClick={gerar}
            className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white"
          >
            Gerar competência
          </button>
        )}
        {podeGerar && <GerarRetroativo anoAtual={ano} onDone={() => recarregar(ano, mes)} />}
      </div>

      <p className="text-sm text-cinza">
        <strong className="text-texto">
          {filtradas.length} {filtradas.length === 1 ? "obrigação" : "obrigações"}
        </strong>
        {resumoStatus && <span> · {resumoStatus}</span>}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Obrigação</th>
              <th className="px-3 py-2 font-medium">Competência</th>
              <th className="px-3 py-2 font-medium">Interno</th>
              <th className="px-3 py-2 font-medium">Legal</th>
              <th className="px-3 py-2 font-medium">Responsável</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-cinza">
                  {carregando ? "Carregando…" : "Sem obrigações nesta competência. Use “Gerar competência”."}
                </td>
              </tr>
            )}
            {filtradas.map((r) => {
              const sev = classificarAlerta(r.vencimentoInterno, hoje);
              return (
                <tr key={r.id} className="border-b border-linha/60">
                  <td className="px-3 py-1.5 text-texto">{r.clienteNome}</td>
                  <td className="px-3 py-1.5">{r.obrigacaoNome}</td>
                  <td className="px-3 py-1.5">{rotuloComp(r.competencia, r.periodicidade)}</td>
                  <td className="px-3 py-1.5">{dataBR(r.vencimentoInterno)}</td>
                  <td className="px-3 py-1.5">{dataBR(r.vencimentoLegal)}</td>
                  <td className="px-3 py-1.5">{r.responsavelNome ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-col gap-1">
                      {sev && r.status === "pendente" ? (
                        <span className={`w-fit rounded px-1.5 py-0.5 text-xs ${SELO[sev]}`}>
                          {sev.replace("_", " ")}
                        </span>
                      ) : null}
                      <AcoesInstancia inst={r} onDone={() => recarregar(ano, mes)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
