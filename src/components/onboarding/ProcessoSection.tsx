"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  iniciarProcesso,
  salvarProcessoItem,
  removerProcessoItem,
  revelarSenha,
  anexarProcessoItem,
  urlAnexoProcessoItem,
  removerAnexoProcessoItem,
  gerarOportunidadeConsultoria,
  type ItemProcessoView,
  type ProcessoView,
} from "@/app/(app)/clientes/[id]/processo";
import { motivosBloqueioConclusao, type PerfilCliente, type StatusItem } from "@/lib/onboarding/processo";
import { Botao } from "@/components/ui/Botao";

const PERFIS: { v: PerfilCliente; l: string }[] = [
  { v: "mei", l: "MEI" },
  { v: "simples_sem_func", l: "Simples sem funcionários" },
  { v: "simples_com_func", l: "Simples com funcionários" },
  { v: "presumido_real", l: "Lucro Presumido / Real" },
  { v: "pf", l: "Pessoa física" },
];
const FLAGS: { k: string; l: string }[] = [
  { k: "possui_contador_anterior", l: "Tem contador anterior (transferência)" },
  { k: "possui_funcionarios", l: "Tem funcionários" },
  { k: "possui_prolabore", l: "Tem pró-labore" },
  { k: "atividade_exige_licencas", l: "Atividade exige licenças/alvará" },
  { k: "possui_erp", l: "Usa ERP / emissor próprio" },
  { k: "complexidade_alta", l: "Complexidade fiscal alta" },
];
const STATUS_LABEL: Record<StatusItem, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  dispensado: "Dispensado",
};
const STATUS_CLS: Record<StatusItem, string> = {
  pendente: "bg-linha text-cinza",
  concluido: "bg-verde/10 text-verde",
  dispensado: "bg-cinza/10 text-cinza",
};
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Prog = {
  total: number;
  concluidos: number;
  bloqueantesPendentes: number;
  pct: number;
  concluido: boolean;
  proximoPrazo: string | null;
};
type Usuario = { id: string; nome: string };
type FormItem = Partial<ItemProcessoView> & { novaSenha?: string };

export function ProcessoSection({
  clienteId,
  processo,
  itens,
  progresso,
  usuarios,
  podeRevelar,
  perfilSugerido,
  hoje,
  templates,
}: {
  clienteId: string;
  processo: ProcessoView;
  itens: ItemProcessoView[];
  progresso: Prog;
  usuarios: Usuario[];
  podeRevelar: boolean;
  perfilSugerido: PerfilCliente;
  hoje: string;
  templates: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [perfil, setPerfil] = useState<PerfilCliente>(perfilSugerido);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dataInicio, setDataInicio] = useState(hoje);
  const [form, setForm] = useState<FormItem | null>(null);
  const [senhas, setSenhas] = useState<Record<string, string>>({});

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) {
      alert(r.erro);
      return;
    }
    setForm(null);
    setAbrindo(false);
    router.refresh();
  }
  async function ver(it: ItemProcessoView) {
    setOcupado(true);
    const r = await revelarSenha(it.id);
    setOcupado(false);
    if (r.erro) {
      alert(r.erro);
      return;
    }
    setSenhas((s) => ({ ...s, [it.id]: r.senha ?? "" }));
  }
  async function mudarStatus(it: ItemProcessoView, status: StatusItem) {
    if (!processo) return;
    await chamar(() =>
      salvarProcessoItem({
        id: it.id,
        processoId: processo.id,
        clienteId,
        blocoOrdem: it.blocoOrdem,
        blocoNome: it.blocoNome,
        codigo: it.codigo,
        titulo: it.titulo,
        tipo: it.tipo,
        responsavelPapel: it.responsavelPapel,
        responsavelId: it.responsavelId,
        prazo: it.prazo,
        status,
        observacao: it.observacao,
        bloqueante: it.bloqueante,
        dependeDe: it.dependeDe,
        anexoObrigatorio: it.anexoObrigatorio,
        campoDestino: it.campoDestino,
        valorDestino: it.valorDestino,
        acessoUrl: it.acessoUrl,
        acessoLogin: it.acessoLogin,
        ordem: it.ordem,
      }),
    );
  }
  function salvarForm() {
    if (!form || !processo) return;
    void chamar(() =>
      salvarProcessoItem({
        id: form.id,
        processoId: processo.id,
        clienteId,
        blocoOrdem: form.blocoOrdem ?? 99,
        blocoNome: form.blocoNome ?? "Itens adicionais",
        codigo: form.codigo ?? null,
        titulo: form.titulo ?? "",
        tipo: (form.tipo ?? "padrao") as "padrao" | "acesso",
        responsavelPapel: form.responsavelPapel ?? null,
        responsavelId: form.responsavelId ?? null,
        prazo: form.prazo ?? null,
        status: (form.status ?? "pendente") as StatusItem,
        observacao: form.observacao ?? null,
        bloqueante: form.bloqueante ?? false,
        dependeDe: form.dependeDe ?? [],
        anexoObrigatorio: form.anexoObrigatorio ?? false,
        campoDestino: form.campoDestino ?? null,
        valorDestino: form.valorDestino ?? null,
        acessoUrl: form.acessoUrl ?? null,
        acessoLogin: form.acessoLogin ?? null,
        novaSenha: form.novaSenha || null,
        ordem: form.ordem ?? 0,
      }),
    );
  }

  if (!processo) {
    return (
      <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        {!abrindo ? (
          templates.length === 0 ? (
            <p className="text-sm text-cinza">Cadastre um template ativo em Configurações → Template de onboarding.</p>
          ) : (
            <>
              <p className="text-sm text-cinza">Nenhum processo de entrada iniciado.</p>
              <Botao variante="primario" disabled={ocupado} onClick={() => setAbrindo(true)}>
                Iniciar processo
              </Botao>
            </>
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-cinza">
                Template
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={`${controleCls("compacto")} mt-0.5 block`}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-cinza">
                Data de início
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className={`${controleCls("compacto")} mt-0.5 block`}
                />
              </label>
              <label className="text-xs text-cinza">
                Perfil
                <select
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value as PerfilCliente)}
                  className={`${controleCls("compacto")} mt-0.5 block`}
                >
                  {PERFIS.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-1">
              <legend className="text-xs text-cinza">Condições do cliente</legend>
              {FLAGS.map((f) => (
                <label key={f.k} className="flex items-center gap-2 text-sm text-texto">
                  <input
                    type="checkbox"
                    checked={!!flags[f.k]}
                    onChange={(e) => setFlags((s) => ({ ...s, [f.k]: e.target.checked }))}
                  />
                  {f.l}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Botao variante="fantasma" onClick={() => setAbrindo(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                disabled={ocupado || !templateId}
                onClick={() => chamar(() => iniciarProcesso(clienteId, perfil, flags, dataInicio, templateId))}
              >
                Criar processo
              </Botao>
            </div>
          </div>
        )}
      </section>
    );
  }

  const blocos = Array.from(new Set(itens.map((i) => i.blocoOrdem))).sort((a, b) => a - b);
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? null;
  const statusIrmaos = itens.map((i) => ({ codigo: i.codigo, status: i.status }));
  function bloqueios(it: ItemProcessoView): string[] {
    return motivosBloqueioConclusao(
      {
        dependeDe: it.dependeDe,
        anexoObrigatorio: it.anexoObrigatorio,
        temAnexo: it.temAnexo,
        campoDestino: it.campoDestino,
        temValorDestino: !!it.valorDestino,
      },
      statusIrmaos,
    );
  }
  async function anexar(it: ItemProcessoView, file: File) {
    const fd = new FormData();
    fd.append("arquivo", file);
    await chamar(() => anexarProcessoItem(it.id, clienteId, fd));
  }
  async function baixar(it: ItemProcessoView) {
    const r = await urlAnexoProcessoItem(it.id);
    if (r.erro) return alert(r.erro);
    if (r.url) window.open(r.url, "_blank");
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Onboarding</h2>
        <Botao variante="secundario" disabled={ocupado} onClick={() => setForm({ status: "pendente", tipo: "padrao" })}>
          + Item
        </Botao>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-cinza">
          <span>{progresso.pct}% concluído</span>
          <span>{progresso.bloqueantesPendentes} bloqueante(s) pendente(s)</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-linha">
          <div className="h-full rounded-full bg-verde" style={{ width: `${progresso.pct}%` }} />
        </div>
      </div>

      {blocos.map((bo) => {
        const doBloco = itens.filter((i) => i.blocoOrdem === bo);
        return (
          <div key={bo} className="space-y-1.5">
            <h3 className="font-display text-[11px] font-semibold uppercase tracking-wide text-cinza">
              {doBloco[0]?.blocoNome}
            </h3>
            {doBloco.map((it) => {
              const atrasado = !!it.prazo && it.prazo < hoje && it.status === "pendente";
              return (
                <div key={it.id} className="rounded-lg border border-linha/70 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {it.codigo && <span className="font-mono text-[11px] text-cinza-claro">{it.codigo}</span>}
                    <span className="font-medium text-texto">{it.titulo}</span>
                    {it.bloqueante && (
                      <span className="rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloqueante</span>
                    )}
                    {it.anexoObrigatorio && <span className="text-[10px] text-cinza-claro">anexo</span>}
                    <select
                      value={it.status}
                      disabled={ocupado}
                      onChange={(e) => mudarStatus(it, e.target.value as StatusItem)}
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[it.status]}`}
                    >
                      {(["pendente", "concluido", "dispensado"] as StatusItem[]).map((s) => (
                        <option key={s} value={s} disabled={s === "concluido" && bloqueios(it).length > 0}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setForm(it)} className="text-xs text-cinza underline">
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => chamar(() => removerProcessoItem(it.id, clienteId))}
                      className="text-xs text-negativo underline"
                    >
                      Remover
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cinza">
                    {it.responsavelPapel && <span>Papel: {it.responsavelPapel}</span>}
                    {nomeUsuario(it.responsavelId) && <span>Resp.: {nomeUsuario(it.responsavelId)}</span>}
                    {it.prazo && (
                      <span className={atrasado ? "font-semibold text-negativo" : ""}>Prazo: {dataBR(it.prazo)}</span>
                    )}
                    {it.observacao && <span>Obs.: {it.observacao}</span>}
                  </div>
                  {bloqueios(it).length > 0 && (
                    <p className="mt-1 text-[11px] text-negativo">Para concluir: {bloqueios(it).join(" · ")}</p>
                  )}
                  {it.campoDestino === "competencia_inicial" && (
                    <div className="mt-1 text-xs text-cinza">
                      Competência inicial:{" "}
                      <input
                        type="month"
                        value={it.valorDestino ?? ""}
                        disabled={ocupado}
                        onChange={(e) =>
                          chamar(() =>
                            salvarProcessoItem({
                              id: it.id,
                              processoId: processo.id,
                              clienteId,
                              blocoOrdem: it.blocoOrdem,
                              blocoNome: it.blocoNome,
                              codigo: it.codigo,
                              titulo: it.titulo,
                              tipo: it.tipo,
                              responsavelPapel: it.responsavelPapel,
                              responsavelId: it.responsavelId,
                              prazo: it.prazo,
                              status: it.status,
                              observacao: it.observacao,
                              bloqueante: it.bloqueante,
                              dependeDe: it.dependeDe,
                              anexoObrigatorio: it.anexoObrigatorio,
                              campoDestino: it.campoDestino,
                              valorDestino: e.target.value || null,
                              acessoUrl: it.acessoUrl,
                              acessoLogin: it.acessoLogin,
                              ordem: it.ordem,
                            }),
                          )
                        }
                        className={`${controleCls("compacto")} text-xs`}
                      />
                    </div>
                  )}
                  {(it.anexoObrigatorio || it.temAnexo) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cinza">
                      {it.temAnexo ? (
                        <>
                          <span>📎 {it.anexoNome}</span>
                          <button type="button" onClick={() => baixar(it)} className="text-verde underline">
                            baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => chamar(() => removerAnexoProcessoItem(it.id, clienteId))}
                            className="text-negativo underline"
                          >
                            remover
                          </button>
                        </>
                      ) : (
                        <label className="cursor-pointer text-verde underline">
                          anexar arquivo
                          <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg"
                            className="hidden"
                            disabled={ocupado}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void anexar(it, f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {it.alertaRisco && (
                    <p className="mt-1 rounded bg-negativo/10 px-2 py-1 text-xs text-negativo">⚠ {it.alertaRisco}</p>
                  )}
                  <div className="mt-1 text-xs">
                    {it.oportunidadeId ? (
                      <span className="text-cinza">
                        Oportunidade de consultoria criada ✓{" "}
                        <Link href="/comercial" className="text-verde underline">
                          ver no funil
                        </Link>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => void chamar(() => gerarOportunidadeConsultoria(it.id))}
                        className="text-violeta underline"
                      >
                        Gerar oportunidade de consultoria
                      </button>
                    )}
                  </div>
                  {it.tipo === "acesso" && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-cinza">
                      {it.acessoUrl && <span>URL: {it.acessoUrl}</span>}
                      {it.acessoLogin && <span>Login: {it.acessoLogin}</span>}
                      {it.temSenha && podeRevelar && (
                        <button
                          type="button"
                          onClick={() => ver(it)}
                          disabled={ocupado}
                          className="text-verde underline"
                        >
                          {senhas[it.id] ? `Senha: ${senhas[it.id]}` : "Revelar senha"}
                        </button>
                      )}
                      {it.temSenha && !podeRevelar && <span className="text-cinza-claro">senha protegida</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">{form.id ? "Editar item" : "Novo item"}</h3>
            <label className="block text-xs text-cinza">
              Título
              <input
                value={form.titulo ?? ""}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className={`${controleCls("compacto")} mt-0.5 w-full`}
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Tipo
                <select
                  value={form.tipo ?? "padrao"}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as "padrao" | "acesso" })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                >
                  <option value="padrao">Padrão</option>
                  <option value="acesso">Acesso (cofre)</option>
                </select>
              </label>
              <label className="flex-1 text-xs text-cinza">
                Responsável
                <select
                  value={form.responsavelId ?? ""}
                  onChange={(e) => setForm({ ...form, responsavelId: e.target.value || null })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                >
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
                <input
                  type="date"
                  value={form.prazo ?? ""}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value || null })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
              <label className="flex items-end gap-1 text-xs text-cinza">
                <input
                  type="checkbox"
                  checked={form.bloqueante ?? false}
                  onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })}
                />{" "}
                Bloqueante
              </label>
            </div>
            {form.campoDestino === "competencia_inicial" && (
              <label className="block text-xs text-cinza">
                Competência inicial
                <input
                  type="month"
                  value={form.valorDestino ?? ""}
                  onChange={(e) => setForm({ ...form, valorDestino: e.target.value || null })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
            )}
            <label className="block text-xs text-cinza">
              Observação
              <textarea
                value={form.observacao ?? ""}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={2}
                className={`${controleCls("compacto")} mt-0.5 w-full`}
              />
            </label>
            {form.tipo === "acesso" && (
              <div className="space-y-2 rounded-lg bg-creme p-2">
                <label className="block text-xs text-cinza">
                  URL do portal
                  <input
                    value={form.acessoUrl ?? ""}
                    onChange={(e) => setForm({ ...form, acessoUrl: e.target.value || null })}
                    className={`${controleCls("compacto")} mt-0.5 w-full`}
                  />
                </label>
                <label className="block text-xs text-cinza">
                  Login
                  <input
                    value={form.acessoLogin ?? ""}
                    onChange={(e) => setForm({ ...form, acessoLogin: e.target.value || null })}
                    className={`${controleCls("compacto")} mt-0.5 w-full`}
                  />
                </label>
                <label className="block text-xs text-cinza">
                  Senha (vazio = manter)
                  <input
                    type="password"
                    value={form.novaSenha ?? ""}
                    onChange={(e) => setForm({ ...form, novaSenha: e.target.value })}
                    className={`${controleCls("compacto")} mt-0.5 w-full`}
                  />
                </label>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !(form.titulo ?? "").trim()} onClick={salvarForm}>
                Salvar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
