"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarTemplate, salvarTemplate, excluirTemplate, semearTemplatePadrao, type TemplateResumo } from "@/app/(app)/onboarding/template-actions";
import { Botao } from "@/components/ui/Botao";

export function GerenciadorTemplates({ templates }: { templates: TemplateResumo[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState<{ nome: string; descricao: string } | null>(null);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function criar() {
    if (!novo) return;
    setOcupado(true);
    const r = await criarTemplate(novo.nome, novo.descricao || null);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setNovo(null);
    if (r.id) router.push(`/configuracoes/onboarding/${r.id}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {templates.length === 0 && (
          <Botao variante="secundario" disabled={ocupado} onClick={() => chamar(() => semearTemplatePadrao())}>
            Semear template padrão
          </Botao>
        )}
        <Botao variante="primario" disabled={ocupado} onClick={() => setNovo({ nome: "", descricao: "" })}>
          Novo template
        </Botao>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum template. Semeie o padrão ou crie um novo.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Template</th>
                <th className="px-3 py-2 text-right font-medium">Blocos</th>
                <th className="px-3 py-2 text-right font-medium">Itens</th>
                <th className="px-3 py-2 text-right font-medium">Processos</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-linha/60">
                  <td className="px-3 py-2">
                    <Link href={`/configuracoes/onboarding/${t.id}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">
                      {t.nome}
                    </Link>
                    {!t.ativo && <span className="ml-2 rounded bg-cinza/10 px-1.5 text-[10px] text-cinza">inativo</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.blocos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.itens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.processos}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => chamar(() => salvarTemplate(t.id, t.nome, t.descricao, !t.ativo))} className="mr-3 text-xs text-cinza underline">
                      {t.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button type="button" onClick={() => { if (confirm(`Excluir "${t.nome}"?`)) void chamar(() => excluirTemplate(t.id)); }} className="text-xs text-negativo underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {novo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">Novo template</h3>
            <label className="block text-xs text-cinza">
              Nome
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs text-cinza">
              Descrição
              <textarea value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setNovo(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !novo.nome.trim()} onClick={criar}>
                Criar e abrir
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
