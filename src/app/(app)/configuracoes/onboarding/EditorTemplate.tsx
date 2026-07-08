"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarTemplateItem, removerTemplateItem, semearTemplatePadrao, type TemplateView, type ItemTemplateView } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"];
type Form = Partial<ItemTemplateView>;

export function EditorTemplate({ template }: { template: TemplateView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) {
      alert(r.erro);
      return;
    }
    setForm(null);
    router.refresh();
  }
  function salvar() {
    if (!form || !form.blocoId) return;
    void chamar(() => salvarTemplateItem({ id: form.id, blocoId: form.blocoId!, codigo: form.codigo ?? "", titulo: form.titulo ?? "", descricao: form.descricao ?? null, tipo: (form.tipo ?? "padrao") as "padrao" | "acesso", responsavelPapel: form.responsavelPapel ?? null, prazoDias: form.prazoDias ?? null, aplicavelA: form.aplicavelA ?? ["*"], condicaoFlags: form.condicaoFlags ?? [], condicaoModo: (form.condicaoModo ?? "all") as "any" | "all", bloqueante: form.bloqueante ?? false, anexoObrigatorio: form.anexoObrigatorio ?? false, alertaRisco: form.alertaRisco ?? null, ordem: form.ordem ?? 0 }));
  }

  if (!template) {
    return (
      <div className="rounded-2xl border border-linha bg-white p-6 text-center">
        <p className="text-sm text-cinza">Nenhum template configurado.</p>
        <div className="mt-3">
          <Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => semearTemplatePadrao())}>
            Semear template padrão
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cinza">{template.nome}</p>
      {template.blocos.map((b) => (
        <div key={b.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-wide text-texto">
              {b.ordem}. {b.nome}
            </h3>
            {b.prazoBlocoDias != null && <span className="font-mono text-[11px] text-cinza-claro">D+{b.prazoBlocoDias}</span>}
            <button type="button" onClick={() => setForm({ blocoId: b.id, tipo: "padrao", aplicavelA: ["*"], condicaoModo: "all", ordem: (b.itens.at(-1)?.ordem ?? 0) + 1 })} className="ml-auto text-xs text-cinza underline">
              + item
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-linha bg-white">
            <table className="min-w-full text-sm">
              <tbody>
                {b.itens.map((i) => (
                  <tr key={i.id} className="border-b border-linha/60">
                    <td className="px-3 py-2 font-mono text-[11px] text-cinza-claro">{i.codigo}</td>
                    <td className="px-3 py-2 text-texto">
                      {i.titulo}
                      {i.bloqueante && <span className="ml-2 rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloq.</span>}
                      {i.tipo === "acesso" && <span className="ml-2 rounded bg-verde/10 px-1.5 text-[10px] text-verde">cofre</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-cinza">{i.prazoDias != null ? `D+${i.prazoDias}` : "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-cinza">{i.aplicavelA.includes("*") ? "todos" : i.aplicavelA.join(", ")}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">
                        Editar
                      </button>
                      <button type="button" onClick={() => chamar(() => removerTemplateItem(i.id))} className="text-xs text-negativo underline">
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {b.itens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-cinza-claro">
                      Sem itens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <div className="flex gap-2">
              <label className="w-24 text-xs text-cinza">
                Código
                <input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="flex-1 text-xs text-cinza">
                Título
                <input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Responsável (papel)
                <select value={form.responsavelPapel ?? ""} onChange={(e) => setForm({ ...form, responsavelPapel: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {["admin", "contador", "assistente", "financeiro"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-24 text-xs text-cinza">
                Prazo D+
                <input type="number" value={form.prazoDias ?? ""} onChange={(e) => setForm({ ...form, prazoDias: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="w-28 text-xs text-cinza">
                Tipo
                <select value={form.tipo ?? "padrao"} onChange={(e) => setForm({ ...form, tipo: e.target.value as "padrao" | "acesso" })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="padrao">Padrão</option>
                  <option value="acesso">Cofre</option>
                </select>
              </label>
            </div>
            <fieldset className="text-xs text-cinza">
              <legend>Aplicável aos perfis</legend>
              <label className="mr-3 inline-flex items-center gap-1">
                <input type="checkbox" checked={(form.aplicavelA ?? []).includes("*")} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? ["*"] : [] })} /> todos
              </label>
              {PERFIS.map((pf) => (
                <label key={pf} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" disabled={(form.aplicavelA ?? []).includes("*")} checked={(form.aplicavelA ?? []).includes(pf)} onChange={(e) => setForm({ ...form, aplicavelA: e.target.checked ? [...(form.aplicavelA ?? []).filter((x) => x !== "*"), pf] : (form.aplicavelA ?? []).filter((x) => x !== pf) })} /> {pf}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-4 text-xs text-cinza">
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={form.bloqueante ?? false} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} /> Bloqueante
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={form.anexoObrigatorio ?? false} onChange={(e) => setForm({ ...form, anexoObrigatorio: e.target.checked })} /> Anexo obrigatório
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvar}>
                Salvar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
