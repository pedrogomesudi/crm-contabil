"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGIMES } from "@/lib/tipos";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { VARIAVEIS } from "@/lib/email/template";
import { TETO_WHATSAPP, descreverFiltro, type Filtro } from "@/lib/comunicados/segmento";
import { previa, enviarTesteComunicado, dispararComunicado, type Canal, type PreviaView } from "../actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";
const TIPOS = ["PJ", "PF", "MEI"];
const STATUS = [
  { valor: "ativo", rotulo: "Ativo" },
  { valor: "em_constituicao", rotulo: "Em constituição" },
  { valor: "inativo", rotulo: "Inativo" },
];

type Colab = { id: string; nome: string };

export function FormComunicado({ contadores, colaboradores }: { contadores: Colab[]; colaboradores: Colab[] }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [canal, setCanal] = useState<Canal>("email");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({});
  const [prev, setPrev] = useState<PreviaView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  // Trocar o segmento invalida a prévia — senão o operador dispararia olhando um número velho.
  const mudarFiltro = (patch: Partial<Filtro>) => {
    setFiltro((f) => ({ ...f, ...patch }));
    setPrev(null);
  };

  const alternarLista = (campo: "regimes" | "tipos" | "status", valor: string) =>
    setFiltro((f) => {
      const atual = f[campo] ?? [];
      const nova = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
      setPrev(null);
      return { ...f, [campo]: nova.length ? nova : undefined };
    });

  function inserirVariavel(chave: string) {
    const el = corpoRef.current;
    if (!el) return setCorpo((c) => `${c}{${chave}}`);
    const ini = el.selectionStart;
    const fim = el.selectionEnd;
    setCorpo((c) => `${c.slice(0, ini)}{${chave}}${c.slice(fim)}`);
    el.focus();
  }

  async function verPrevia() {
    setOcupado(true);
    setErro(null);
    const p = await previa(filtro, canal);
    setOcupado(false);
    setPrev(p);
  }

  async function testar() {
    setOcupado(true);
    setErro(null);
    setMsg(null);
    const r = await enviarTesteComunicado({ titulo, assunto, corpo, canal, filtro });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setMsg("E-mail de teste enviado para você.");
  }

  async function disparar() {
    if (!prev || prev.total === 0) return;
    const canalTxt = canal === "email" ? "e-mail" : "WhatsApp";
    if (!confirm(`Disparar este comunicado por ${canalTxt} para ${prev.total} cliente(s)? Não há como desfazer.`))
      return;
    setOcupado(true);
    setErro(null);
    const r = await dispararComunicado({ titulo, assunto, corpo, canal, filtro });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.id) router.push(`/comunicados/${r.id}`);
  }

  const chip = (ativo: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs ${ativo ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza"}`;

  return (
    <div className="space-y-4">
      {/* 1. Conteúdo */}
      <section className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">1. Conteúdo</h2>

        <div className="flex flex-wrap gap-2">
          <label className="flex-1 text-xs text-cinza">
            Título interno (não vai ao cliente)
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={`mt-0.5 block w-full ${cls}`}
            />
          </label>
          <label className="text-xs text-cinza">
            Canal
            <select
              value={canal}
              onChange={(e) => {
                setCanal(e.target.value as Canal);
                setPrev(null);
              }}
              className={`mt-0.5 block ${cls}`}
            >
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
        </div>

        {canal === "whatsapp" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Atenção:</strong> disparo em massa por WhatsApp é o gatilho clássico de banimento do número pela
            Meta — e o canal é não oficial (Z-API). Perder o número derruba o <strong>atendimento</strong> e a{" "}
            <strong>régua de cobrança</strong> de uma vez. Teto de {TETO_WHATSAPP} destinatários por comunicado.
          </p>
        )}

        <label className="block text-xs text-cinza">
          Assunto
          <input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            className={`mt-0.5 block w-full ${cls}`}
          />
        </label>

        <div>
          <p className="text-xs text-cinza">Variáveis (clique para inserir):</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {VARIAVEIS.filter((v) => ["nome", "cnpj", "email", "escritorio", "hoje"].includes(v.chave)).map((v) => (
              <button
                key={v.chave}
                type="button"
                title={v.rotulo}
                onClick={() => inserirVariavel(v.chave)}
                className="rounded-lg border border-linha px-2 py-1 font-mono text-xs text-cinza hover:bg-creme"
              >
                {`{${v.chave}}`}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-xs text-cinza">
          Mensagem
          <textarea
            ref={corpoRef}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={7}
            className={`mt-0.5 block w-full ${cls}`}
          />
        </label>
      </section>

      {/* 2. Segmento */}
      <section className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-texto">2. Quem recebe</h2>
          <span className="text-xs text-cinza">{descreverFiltro(filtro)}</span>
        </div>

        <div>
          <p className="text-xs text-cinza">Regime</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {REGIMES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => alternarLista("regimes", r)}
                className={chip(filtro.regimes?.includes(r) ?? false)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-cinza">Tipo</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => alternarLista("tipos", t)}
                className={chip(filtro.tipos?.includes(t) ?? false)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-cinza">Status</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {STATUS.map((s) => (
              <button
                key={s.valor}
                type="button"
                onClick={() => alternarLista("status", s.valor)}
                className={chip(filtro.status?.includes(s.valor) ?? false)}
              >
                {s.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-cinza">
            Cidade
            <input
              value={filtro.cidade ?? ""}
              onChange={(e) => mudarFiltro({ cidade: e.target.value || null })}
              className={`mt-0.5 block w-48 ${cls}`}
            />
          </label>
          <label className="text-xs text-cinza">
            UF
            <input
              value={filtro.uf ?? ""}
              maxLength={2}
              onChange={(e) => mudarFiltro({ uf: e.target.value.toUpperCase() || null })}
              className={`mt-0.5 block w-20 ${cls}`}
            />
          </label>
          <label className="text-xs text-cinza">
            Contador
            <select
              value={filtro.contadorId ?? ""}
              onChange={(e) => mudarFiltro({ contadorId: e.target.value || null })}
              className={`mt-0.5 block ${cls}`}
            >
              <option value="">Todos</option>
              {contadores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-cinza">
            Responsável
            <select
              value={filtro.responsavelId ?? ""}
              onChange={(e) => mudarFiltro({ responsavelId: e.target.value || null })}
              className={`mt-0.5 block ${cls}`}
            >
              <option value="">Todos</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-cinza">
            no departamento
            <select
              value={filtro.departamento ?? ""}
              onChange={(e) => mudarFiltro({ departamento: e.target.value || null })}
              className={`mt-0.5 block ${cls}`}
            >
              <option value="">qualquer</option>
              {DEPARTAMENTOS.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* 3. Prévia e disparo */}
      <section className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">3. Conferir e disparar</h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={verPrevia}
            disabled={ocupado}
            className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60"
          >
            Ver quem vai receber
          </button>
          <button
            onClick={testar}
            disabled={ocupado || !assunto || !corpo}
            className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60"
          >
            Enviar teste para mim
          </button>
          <button
            onClick={disparar}
            disabled={ocupado || !prev || prev.total === 0 || Boolean(prev.bloqueio) || !titulo || !assunto || !corpo}
            className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
            title={!prev ? "Veja a prévia antes de disparar" : ""}
          >
            {ocupado ? "Enviando…" : prev ? `Disparar para ${prev.total}` : "Disparar"}
          </button>
        </div>

        {msg && <p className="text-xs text-verde">{msg}</p>}
        {erro && (
          <p role="alert" className="text-xs text-negativo">
            {erro}
          </p>
        )}

        {prev && (
          <div className="space-y-2">
            {prev.bloqueio && (
              <p role="alert" className="rounded-lg bg-negativo/10 px-3 py-2 text-xs text-negativo">
                {prev.bloqueio}
              </p>
            )}
            <p className="text-xs text-cinza">
              <strong className="text-texto">{prev.total}</strong> receberão · {prev.excluidos.length} excluído(s)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="max-h-48 overflow-y-auto rounded-lg border border-linha p-2">
                <p className="text-xs font-medium text-cinza">Vão receber</p>
                <ul className="mt-1 space-y-0.5 text-xs text-texto">
                  {prev.destinatarios.map((d) => (
                    <li key={d.id} className="truncate">
                      {d.nome} <span className="text-cinza">· {d.para}</span>
                    </li>
                  ))}
                  {prev.destinatarios.length === 0 && <li className="text-cinza">Ninguém.</li>}
                </ul>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-linha p-2">
                <p className="text-xs font-medium text-cinza">Excluídos (e por quê)</p>
                <ul className="mt-1 space-y-0.5 text-xs text-cinza">
                  {prev.excluidos.map((e, i) => (
                    <li key={i} className="truncate">
                      {e.nome} <span className="text-cinza-claro">· {e.motivo}</span>
                    </li>
                  ))}
                  {prev.excluidos.length === 0 && <li className="text-cinza-claro">Nenhum.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
