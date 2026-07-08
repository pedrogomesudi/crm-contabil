"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarOnboarding, salvarItemOnboarding, removerItemOnboarding, revelarSenha, type ItemClienteView } from "@/app/(app)/clientes/[id]/onboarding";
import { agruparPorCategoria, type CategoriaOnb, type StatusOnb } from "@/lib/onboarding/progresso";
import { Botao } from "@/components/ui/Botao";

const CAT_LABEL: Record<CategoriaOnb, string> = { documento: "Documentos", procuracao: "Procurações", certificado: "Certificados", acesso: "Acessos", responsavel: "Responsáveis" };
const STATUS_LABEL: Record<StatusOnb, string> = { pendente: "Pendente", concluido: "Concluído", dispensado: "Dispensado" };
const STATUS_CLS: Record<StatusOnb, string> = { pendente: "bg-linha text-cinza", concluido: "bg-verde/10 text-verde", dispensado: "bg-cinza/10 text-cinza" };

type Prog = { total: number; concluidos: number; obrigatoriosPendentes: number; pct: number; concluido: boolean };
type Usuario = { id: string; nome: string };
type FormState = Partial<ItemClienteView> & { novaSenha?: string };

export function OnboardingSection({ clienteId, itens, progresso, usuarios, podeRevelar }: { clienteId: string; itens: ItemClienteView[]; progresso: Prog; usuarios: Usuario[]; podeRevelar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const grupos = agruparPorCategoria(itens);
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "—";

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

  async function mudarStatus(it: ItemClienteView, status: StatusOnb) {
    await chamar(() =>
      salvarItemOnboarding({ id: it.id, clienteId, categoria: it.categoria, nome: it.nome, obrigatorio: it.obrigatorio, status, responsavelId: it.responsavelId, prazo: it.prazo, observacao: it.observacao, acessoUrl: it.acessoUrl, acessoLogin: it.acessoLogin }),
    );
  }
  async function ver(it: ItemClienteView) {
    setOcupado(true);
    const r = await revelarSenha(it.id);
    setOcupado(false);
    if (r.erro) {
      alert(r.erro);
      return;
    }
    setSenhas((s) => ({ ...s, [it.id]: r.senha ?? "" }));
  }
  function salvarForm() {
    if (!form) return;
    void chamar(() =>
      salvarItemOnboarding({
        id: form.id,
        clienteId,
        categoria: (form.categoria ?? "documento") as CategoriaOnb,
        nome: form.nome ?? "",
        obrigatorio: form.obrigatorio ?? true,
        status: (form.status ?? "pendente") as StatusOnb,
        responsavelId: form.responsavelId ?? null,
        prazo: form.prazo ?? null,
        observacao: form.observacao ?? null,
        acessoUrl: form.acessoUrl ?? null,
        acessoLogin: form.acessoLogin ?? null,
        novaSenha: form.novaSenha || null,
      }),
    );
  }

  if (itens.length === 0) {
    return (
      <section className="rounded-2xl border border-linha bg-white p-5">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <p className="mt-1 text-sm text-cinza">Nenhum checklist iniciado para este cliente.</p>
        <div className="mt-3">
          <Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => iniciarOnboarding(clienteId))}>
            Iniciar onboarding
          </Botao>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <Botao variante="secundario" disabled={ocupado} onClick={() => setForm({ categoria: "documento", obrigatorio: true, status: "pendente" })}>
          + Item
        </Botao>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-cinza">
          <span>{progresso.pct}% concluído</span>
          <span>{progresso.obrigatoriosPendentes} obrigatório(s) pendente(s)</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-linha">
          <div className="h-full rounded-full bg-verde" style={{ width: `${progresso.pct}%` }} />
        </div>
      </div>

      {grupos.map((g) => (
        <div key={g.categoria} className="space-y-1.5">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-wide text-cinza">{CAT_LABEL[g.categoria]}</h3>
          {g.itens.map((it) => (
            <div key={it.id} className="rounded-lg border border-linha/70 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-texto">{it.nome}</span>
                {it.obrigatorio && <span className="text-[10px] text-cinza-claro">obrigatório</span>}
                <select value={it.status} disabled={ocupado} onChange={(e) => mudarStatus(it, e.target.value as StatusOnb)} className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[it.status]}`}>
                  {(["pendente", "concluido", "dispensado"] as StatusOnb[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setForm(it)} className="text-xs text-cinza underline">
                  Editar
                </button>
                <button type="button" onClick={() => chamar(() => removerItemOnboarding(it.id, clienteId))} className="text-xs text-negativo underline">
                  Remover
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cinza">
                <span>Resp.: {nomeUsuario(it.responsavelId)}</span>
                {it.prazo && (
                  <span>
                    Prazo: {it.prazo.slice(8, 10)}/{it.prazo.slice(5, 7)}/{it.prazo.slice(0, 4)}
                  </span>
                )}
                {it.observacao && <span>Obs.: {it.observacao}</span>}
              </div>
              {it.categoria === "acesso" && (
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-cinza">
                  {it.acessoUrl && <span>URL: {it.acessoUrl}</span>}
                  {it.acessoLogin && <span>Login: {it.acessoLogin}</span>}
                  {it.temSenha && podeRevelar && (
                    <button type="button" onClick={() => ver(it)} disabled={ocupado} className="text-verde underline">
                      {senhas[it.id] ? `Senha: ${senhas[it.id]}` : "Revelar senha"}
                    </button>
                  )}
                  {it.temSenha && !podeRevelar && <span className="text-cinza-claro">senha protegida</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

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
              <label className="flex-1 text-xs text-cinza">
                Responsável
                <select value={form.responsavelId ?? ""} onChange={(e) => setForm({ ...form, responsavelId: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Prazo
                <input type="date" value={form.prazo ?? ""} onChange={(e) => setForm({ ...form, prazo: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
              </label>
              <label className="flex items-end gap-1 text-xs text-cinza">
                <input type="checkbox" checked={form.obrigatorio ?? true} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} /> Obrigatório
              </label>
            </div>
            <label className="block text-xs text-cinza">
              Observação
              <textarea value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
            </label>
            {form.categoria === "acesso" && (
              <div className="space-y-2 rounded-lg bg-creme p-2">
                <label className="block text-xs text-cinza">
                  URL do portal
                  <input value={form.acessoUrl ?? ""} onChange={(e) => setForm({ ...form, acessoUrl: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-cinza">
                  Login
                  <input value={form.acessoLogin ?? ""} onChange={(e) => setForm({ ...form, acessoLogin: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-cinza">
                  Senha (deixe vazio para manter)
                  <input type="password" value={form.novaSenha ?? ""} onChange={(e) => setForm({ ...form, novaSenha: e.target.value })} className="mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
                </label>
                <p className="text-[10px] text-cinza-claro">A senha é cifrada; só admin/contador podem revelar (auditado).</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !(form.nome ?? "").trim()} onClick={salvarForm}>
                Salvar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
