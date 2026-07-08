"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarModeloItem, removerModeloItem, type ItemModelo } from "@/app/(app)/onboarding/actions";
import type { CategoriaOnb } from "@/lib/onboarding/progresso";
import { Botao } from "@/components/ui/Botao";

const CAT_LABEL: Record<CategoriaOnb, string> = { documento: "Documentos", procuracao: "Procurações", certificado: "Certificados", acesso: "Acessos", responsavel: "Responsáveis" };
type Form = Partial<ItemModelo>;

export function EditorModelo({ itens }: { itens: ItemModelo[] }) {
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
    if (!form) return;
    void chamar(() =>
      salvarModeloItem({
        id: form.id,
        categoria: (form.categoria ?? "documento") as CategoriaOnb,
        nome: form.nome ?? "",
        obrigatorio: form.obrigatorio ?? true,
        ordem: form.ordem ?? 0,
        ativo: form.ativo ?? true,
      }),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Botao variante="secundario" onClick={() => setForm({ categoria: "documento", obrigatorio: true, ativo: true, ordem: (itens.at(-1)?.ordem ?? 0) + 1 })}>
          + Item do modelo
        </Botao>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Ordem</th>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Obrig.</th>
              <th className="px-3 py-2 text-left font-medium">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-linha/60">
                <td className="px-3 py-2 tabular-nums">{i.ordem}</td>
                <td className="px-3 py-2">{CAT_LABEL[i.categoria]}</td>
                <td className="px-3 py-2 text-texto">{i.nome}</td>
                <td className="px-3 py-2">{i.obrigatorio ? "Sim" : "Não"}</td>
                <td className="px-3 py-2">{i.ativo ? "Sim" : "Não"}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setForm(i)} className="mr-3 text-xs text-cinza underline">
                    Editar
                  </button>
                  <button type="button" onClick={() => chamar(() => removerModeloItem(i.id))} className="text-xs text-negativo underline">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-cinza-claro">
                  Nenhum item no modelo. Adicione os itens padrão do checklist.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <label className="block text-xs text-cinza">
              Nome
              <input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Categoria
                <select value={form.categoria ?? "documento"} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaOnb })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  {(Object.keys(CAT_LABEL) as CategoriaOnb[]).map((c) => (
                    <option key={c} value={c}>
                      {CAT_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-20 text-xs text-cinza">
                Ordem
                <input type="number" value={form.ordem ?? 0} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.obrigatorio ?? true} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} /> Obrigatório
              </label>
              <label className="flex items-center gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !(form.nome ?? "").trim()} onClick={salvar}>
                Salvar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
