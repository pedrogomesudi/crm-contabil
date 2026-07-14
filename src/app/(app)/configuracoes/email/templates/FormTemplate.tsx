"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VARIAVEIS, aplicarEmail } from "@/lib/email/template";
import { salvarTemplate, excluirTemplate, type TemplateView } from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

// Cliente fictício só para a prévia — o operador vê o resultado antes de salvar.
const EXEMPLO: Record<string, string> = {
  nome: "Padaria Sol Ltda",
  cnpj: "12.345.678/0001-99",
  email: "contato@padariasol.com.br",
  escritorio: "Seu Escritório",
  hoje: "14/07/2026",
  valor: "R$ 890,00",
  vencimento: "20/07/2026",
  competencia: "06/2026",
};

export function FormTemplate({ templates }: { templates: TemplateView[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<TemplateView | null>(null);
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  function abrir(t: TemplateView | null) {
    setEdit(t);
    setNome(t?.nome ?? "");
    setAssunto(t?.assunto ?? "");
    setCorpo(t?.corpo ?? "");
    setAtivo(t?.ativo ?? true);
    setErro(null);
    setAberto(true);
  }

  function inserir(chave: string) {
    const el = corpoRef.current;
    if (!el) return setCorpo((c) => `${c}{${chave}}`);
    const ini = el.selectionStart;
    const fim = el.selectionEnd;
    setCorpo((c) => `${c.slice(0, ini)}{${chave}}${c.slice(fim)}`);
    el.focus();
  }

  async function salvar() {
    setOcupado(true);
    setErro(null);
    const r = await salvarTemplate({ id: edit?.id, nome, assunto, corpo, ativo });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAberto(false);
    router.refresh();
  }

  async function excluir(id: string) {
    setOcupado(true);
    const r = await excluirTemplate(id);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  const previa = aplicarEmail({ assunto, corpo }, EXEMPLO);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Modelos</h2>
        <button onClick={() => abrir(null)} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white">
          Novo modelo
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum modelo ainda.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm">
              <span>
                <span className="font-medium text-texto">{t.nome}</span>
                {!t.ativo && <span className="ml-2 text-xs text-cinza">(inativo)</span>}
                <span className="block text-xs text-cinza">{t.assunto}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => abrir(t)} className="text-verde underline">editar</button>
                <button disabled={ocupado} onClick={() => excluir(t.id)} className="text-negativo underline disabled:opacity-60">excluir</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <div className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
          <h3 className="font-display text-sm font-semibold text-texto">{edit ? "Editar modelo" : "Novo modelo"}</h3>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={`mt-0.5 block w-56 ${cls}`} />
            </label>
            <label className="flex-1 text-xs text-cinza">
              Assunto
              <input value={assunto} onChange={(e) => setAssunto(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
            </label>
            <label className="mt-5 flex items-center gap-1.5 text-xs text-cinza">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
            </label>
          </div>

          <div>
            <p className="text-xs text-cinza">Variáveis (clique para inserir no corpo):</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  title={v.rotulo}
                  onClick={() => inserir(v.chave)}
                  className="rounded-lg border border-linha px-2 py-1 font-mono text-xs text-cinza hover:bg-creme"
                >
                  {`{${v.chave}}`}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-xs text-cinza">
            Corpo
            <textarea ref={corpoRef} value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={8} className={`mt-0.5 block w-full ${cls}`} />
          </label>

          <div className="rounded-lg bg-creme p-3">
            <p className="text-xs font-medium text-cinza">Prévia (cliente de exemplo)</p>
            <p className="mt-1 text-sm font-medium text-texto">{previa.assunto || "—"}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-texto">{previa.corpo || "—"}</p>
          </div>

          <div className="flex items-center gap-3">
            <button disabled={ocupado} onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-cinza underline">cancelar</button>
            {erro && <span role="alert" className="text-xs text-negativo">{erro}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
