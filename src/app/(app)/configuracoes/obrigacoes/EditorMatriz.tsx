"use client";
import { useState } from "react";
import { salvarObrigacao, excluirObrigacao, semearMatrizPadrao, type ObrigacaoRow } from "./actions";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf", "*"];
const vazio: Omit<ObrigacaoRow, "id"> & { id?: string } = { codigo: "", nome: "", esfera: "federal", periodicidade: "mensal", aplicavelA: [], condicaoFlags: [], condicaoModo: "any", ufs: [], cnaePrefixos: [], vencDia: 20, vencMesOffset: 1, vencMes: null, vencAnoOffset: 1, prazoInternoDiasUteis: 0, antecipa: true, ativa: true, ordem: 0 };

export function EditorMatriz({ linhas }: { linhas: ObrigacaoRow[] }) {
  const [form, setForm] = useState<(Omit<ObrigacaoRow, "id"> & { id?: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const csv = (a: string[]) => a.join(", ");
  const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function salvar() {
    if (!form) return;
    const r = await salvarObrigacao(form);
    setMsg(r.ok ? "Salvo." : r.erro ?? "Erro");
    if (r.ok) {
      setForm(null);
      location.reload();
    }
  }
  async function semear() {
    const r = await semearMatrizPadrao();
    setMsg(r.ok ? `Semeadas ${r.inseridas ?? 0} obrigação(ões).` : r.erro ?? "Erro");
    if (r.ok) location.reload();
  }
  async function excluir(id: string) {
    const r = await excluirObrigacao(id);
    if (r.ok) location.reload();
    else setMsg(r.erro ?? "Erro");
  }

  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setForm({ ...vazio })} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Nova obrigação</button>
        <button type="button" onClick={semear} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Semear matriz padrão</button>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Periodicidade</th>
              <th className="px-3 py-2 font-medium">Incidência</th>
              <th className="px-3 py-2 font-medium">Ativa</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-cinza">Nenhuma obrigação. Use “Semear matriz padrão”.</td>
              </tr>
            )}
            {linhas.map((o) => (
              <tr key={o.id} className="border-b border-linha/60">
                <td className="px-3 py-1.5 font-medium text-texto">{o.codigo}</td>
                <td className="px-3 py-1.5">{o.nome}</td>
                <td className="px-3 py-1.5">{o.periodicidade}</td>
                <td className="px-3 py-1.5 text-cinza">{[...o.aplicavelA, ...o.condicaoFlags].join(", ") || "—"}</td>
                <td className="px-3 py-1.5">{o.ativa ? "Sim" : "Não"}</td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" onClick={() => setForm({ ...o })} className="text-verde underline">Editar</button>
                  <button type="button" onClick={() => excluir(o.id)} className="ml-3 text-negativo underline">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={inp} />
            <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
            <select value={form.periodicidade} onChange={(e) => setForm({ ...form, periodicidade: e.target.value })} className={inp}>
              <option value="mensal">mensal</option>
              <option value="trimestral">trimestral</option>
              <option value="anual">anual</option>
            </select>
            <select value={form.esfera} onChange={(e) => setForm({ ...form, esfera: e.target.value })} className={inp}>
              <option value="federal">federal</option>
              <option value="estadual">estadual</option>
              <option value="municipal">municipal</option>
              <option value="trabalhista">trabalhista</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <select multiple value={form.aplicavelA} onChange={(e) => setForm({ ...form, aplicavelA: Array.from(e.target.selectedOptions, (o) => o.value) })} className={inp}>
              {PERFIS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input placeholder="Flags (csv: tem_folha)" value={csv(form.condicaoFlags)} onChange={(e) => setForm({ ...form, condicaoFlags: parse(e.target.value) })} className={inp} />
            <select value={form.condicaoModo} onChange={(e) => setForm({ ...form, condicaoModo: e.target.value })} className={inp}>
              <option value="any">any</option>
              <option value="all">all</option>
            </select>
            <input placeholder="UFs (csv)" value={csv(form.ufs)} onChange={(e) => setForm({ ...form, ufs: parse(e.target.value) })} className={inp} />
            <input placeholder="CNAE prefixos (csv)" value={csv(form.cnaePrefixos)} onChange={(e) => setForm({ ...form, cnaePrefixos: parse(e.target.value) })} className={inp} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-cinza">Dia<input type="number" value={form.vencDia} onChange={(e) => setForm({ ...form, vencDia: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Offset mês<input type="number" value={form.vencMesOffset} onChange={(e) => setForm({ ...form, vencMesOffset: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Mês (anual)<input type="number" value={form.vencMes ?? ""} onChange={(e) => setForm({ ...form, vencMes: e.target.value ? Number(e.target.value) : null })} className={`${inp} ml-1 w-16`} /></label>
            <label className="text-sm text-cinza">Interno (d.úteis)<input type="number" value={form.prazoInternoDiasUteis} onChange={(e) => setForm({ ...form, prazoInternoDiasUteis: Number(e.target.value) })} className={`${inp} ml-1 w-16`} /></label>
            <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={form.antecipa} onChange={(e) => setForm({ ...form, antecipa: e.target.checked })} />antecipa</label>
            <label className="flex items-center gap-1 text-sm text-cinza"><input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />ativa</label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
