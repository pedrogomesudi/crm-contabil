"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarTemplate, criarBloco, salvarBloco, removerBloco, moverBloco, moverItem, salvarTemplateItem, removerTemplateItem, type TemplateView, type ItemTemplateView } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

const PERFIS = ["mei", "simples_sem_func", "simples_com_func", "presumido_real", "pf"];
type Tpl = NonNullable<TemplateView>;
type FormItem = Partial<ItemTemplateView>;
type FormBloco = { id?: string; nome: string; prazoBlocoDias: number | null; ordem: number };

export function EditorTemplate({ template }: { template: Tpl }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<FormItem | null>(null);
  const [bloco, setBloco] = useState<FormBloco | null>(null);
  const [nome, setNome] = useState(template.nome);
  const [descricao, setDescricao] = useState(template.descricao ?? "");
  const [ativo, setAtivo] = useState(template.ativo);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setForm(null);
    setBloco(null);
    router.refresh();
  }
  function salvarItem() {
    if (!form || !form.blocoId) return;
    void chamar(() => salvarTemplateItem({ id: form.id, blocoId: form.blocoId!, codigo: form.codigo ?? "", titulo: form.titulo ?? "", descricao: form.descricao ?? null, tipo: (form.tipo ?? "padrao") as "padrao" | "acesso", responsavelPapel: form.responsavelPapel ?? null, prazoDias: form.prazoDias ?? null, aplicavelA: form.aplicavelA ?? ["*"], condicaoFlags: form.condicaoFlags ?? [], condicaoModo: (form.condicaoModo ?? "all") as "any" | "all", bloqueante: form.bloqueante ?? false, anexoObrigatorio: form.anexoObrigatorio ?? false, alertaRisco: form.alertaRisco ?? null, ordem: form.ordem ?? 0, dependeDe: form.dependeDe ?? [], campoDestino: form.campoDestino ?? null }));
  }
  function salvarBlocoForm() {
    if (!bloco) return;
    void chamar(() => (bloco.id ? salvarBloco(bloco.id, bloco.nome, bloco.prazoBlocoDias, bloco.ordem) : criarBloco(template.id, bloco.nome, bloco.prazoBlocoDias)));
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4">
        <h3 className="font-display text-sm font-semibold text-texto">Configurações</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-cinza">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
          </label>
          <label className="flex items-center gap-1 text-xs text-cinza">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
          </label>
        </div>
        <label className="block text-xs text-cinza">
          Descrição
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
        <div className="flex justify-end">
          <Botao variante="secundario" disabled={ocupado} onClick={() => chamar(() => salvarTemplate(template.id, nome, descricao || null, ativo))}>
            Salvar configurações
          </Botao>
        </div>
      </section>

      <div className="flex justify-end">
        <Botao variante="primario" onClick={() => setBloco({ nome: "", prazoBlocoDias: null, ordem: 0 })}>
          + bloco
        </Botao>
      </div>

      {template.blocos.map((b) => (
        <div key={b.id} className="space-y-1.5 rounded-2xl border border-linha bg-white p-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-wide text-texto">
              {b.ordem}. {b.nome}
            </h3>
            {b.prazoBlocoDias != null && <span className="font-mono text-[11px] text-cinza-claro">D+{b.prazoBlocoDias}</span>}
            <button type="button" onClick={() => chamar(() => moverBloco(b.id, "cima"))} className="text-cinza-claro hover:text-verde">↑</button>
            <button type="button" onClick={() => chamar(() => moverBloco(b.id, "baixo"))} className="text-cinza-claro hover:text-verde">↓</button>
            <button type="button" onClick={() => setBloco({ id: b.id, nome: b.nome, prazoBlocoDias: b.prazoBlocoDias, ordem: b.ordem })} className="text-xs text-cinza underline">editar</button>
            <button type="button" onClick={() => { if (confirm(`Remover o bloco "${b.nome}" e seus itens?`)) void chamar(() => removerBloco(b.id)); }} className="text-xs text-negativo underline">remover</button>
            <button type="button" onClick={() => setForm({ blocoId: b.id, tipo: "padrao", aplicavelA: ["*"], condicaoModo: "all", ordem: (b.itens.at(-1)?.ordem ?? 0) + 1 })} className="ml-auto text-xs text-cinza underline">+ item</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-linha">
            <table className="min-w-full text-sm">
              <tbody>
                {b.itens.map((i) => (
                  <tr key={i.id} className="border-b border-linha/60">
                    <td className="px-2 py-2 font-mono text-[11px] text-cinza-claro">{i.codigo}</td>
                    <td className="px-2 py-2 text-texto">
                      {i.titulo}
                      {i.bloqueante && <span className="ml-2 rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloq.</span>}
                      {i.tipo === "acesso" && <span className="ml-2 rounded bg-verde/10 px-1.5 text-[10px] text-verde">cofre</span>}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] text-cinza">{i.prazoDias != null ? `D+${i.prazoDias}` : "—"}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => chamar(() => moverItem(i.id, "cima"))} className="mr-1 text-cinza-claro hover:text-verde">↑</button>
                      <button type="button" onClick={() => chamar(() => moverItem(i.id, "baixo"))} className="mr-3 text-cinza-claro hover:text-verde">↓</button>
                      <button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">editar</button>
                      <button type="button" onClick={() => chamar(() => removerTemplateItem(i.id))} className="text-xs text-negativo underline">remover</button>
                    </td>
                  </tr>
                ))}
                {b.itens.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-cinza-claro">Sem itens.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {bloco && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{bloco.id ? "Editar bloco" : "Novo bloco"}</h3>
            <label className="block text-xs text-cinza">
              Nome
              <input value={bloco.nome} onChange={(e) => setBloco({ ...bloco, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <label className="w-28 text-xs text-cinza">
                Prazo D+
                <input type="number" value={bloco.prazoBlocoDias ?? ""} onChange={(e) => setBloco({ ...bloco, prazoBlocoDias: e.target.value === "" ? null : Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              {bloco.id && (
                <label className="w-24 text-xs text-cinza">
                  Ordem
                  <input type="number" value={bloco.ordem} onChange={(e) => setBloco({ ...bloco, ordem: Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setBloco(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !bloco.nome.trim()} onClick={salvarBlocoForm}>Salvar</Botao>
            </div>
          </div>
        </div>
      )}

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
                  {["admin", "contador", "assistente", "financeiro"].map((pp) => (
                    <option key={pp} value={pp}>{pp}</option>
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
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Depende de (códigos, vírgula)
                <input value={(form.dependeDe ?? []).join(", ")} onChange={(e) => setForm({ ...form, dependeDe: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" placeholder="ex.: 4.6" />
              </label>
              <label className="flex-1 text-xs text-cinza">
                Grava em
                <select value={form.campoDestino ?? ""} onChange={(e) => setForm({ ...form, campoDestino: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="competencia_inicial">Competência inicial</option>
                </select>
              </label>
            </div>
            <div className="flex gap-4 text-xs text-cinza">
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={form.bloqueante ?? false} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} /> Bloqueante
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={form.anexoObrigatorio ?? false} onChange={(e) => setForm({ ...form, anexoObrigatorio: e.target.checked })} /> Anexo obrigatório
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvarItem}>Salvar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
