"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { aplicarEmail } from "@/lib/email/template";
import {
  enviarEmailCliente,
  type Anexavel,
  type AnexoRef,
  type EmailView,
} from "@/app/(app)/clientes/[id]/email-actions";

type Template = { id: string; nome: string; assunto: string; corpo: string };

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";
const quando = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;

export function EmailsCliente({
  clienteId,
  emailCliente,
  variaveis,
  templates,
  anexaveis,
  emails,
  podeEnviar,
}: {
  clienteId: string;
  emailCliente: string;
  variaveis: Record<string, string>;
  templates: Template[];
  anexaveis: Anexavel[];
  emails: EmailView[];
  podeEnviar: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [para, setPara] = useState(emailCliente);
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [anexos, setAnexos] = useState<AnexoRef[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function usarTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Já entra com as variáveis aplicadas, e o operador ainda pode editar.
    const r = aplicarEmail({ assunto: t.assunto, corpo: t.corpo }, variaveis);
    setAssunto(r.assunto);
    setCorpo(r.corpo);
  }

  function alternarAnexo(a: Anexavel, marcado: boolean) {
    setAnexos((prev) =>
      marcado ? [...prev, { tipo: a.tipo, id: a.id }] : prev.filter((x) => !(x.tipo === a.tipo && x.id === a.id)),
    );
  }

  async function enviar() {
    setOcupado(true);
    setErro(null);
    const r = await enviarEmailCliente({ clienteId, para, assunto, corpo, anexos });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAberto(false);
    setAssunto("");
    setCorpo("");
    setAnexos([]);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">E-mails</h2>
        {podeEnviar && !aberto && (
          <button onClick={() => setAberto(true)} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white">
            Enviar e-mail
          </button>
        )}
      </div>

      {aberto && (
        <div className="space-y-2 rounded-lg border border-linha p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Para
              <input value={para} onChange={(e) => setPara(e.target.value)} className={`mt-0.5 block w-64 ${cls}`} />
            </label>
            {templates.length > 0 && (
              <label className="text-xs text-cinza">
                Modelo
                <select
                  defaultValue=""
                  onChange={(e) => usarTemplate(e.target.value)}
                  className={`mt-0.5 block ${cls}`}
                >
                  <option value="">— escolher —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="block text-xs text-cinza">
            Assunto
            <input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              className={`mt-0.5 block w-full ${cls}`}
            />
          </label>
          <label className="block text-xs text-cinza">
            Mensagem
            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={7}
              className={`mt-0.5 block w-full ${cls}`}
            />
          </label>

          {anexaveis.length > 0 && (
            <div>
              <p className="text-xs text-cinza">Anexos</p>
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                {anexaveis.map((a) => (
                  <label key={`${a.tipo}-${a.id}`} className="flex items-center gap-1.5 text-xs text-texto">
                    <input type="checkbox" onChange={(e) => alternarAnexo(a, e.target.checked)} />
                    {a.nome}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              disabled={ocupado}
              onClick={enviar}
              className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
            >
              {ocupado ? "Enviando…" : "Enviar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-cinza underline">
              cancelar
            </button>
            {erro && (
              <span role="alert" className="text-xs text-negativo">
                {erro}
              </span>
            )}
          </div>
        </div>
      )}

      {emails.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum e-mail enviado a este cliente.</p>
      ) : (
        <ul className="space-y-1.5">
          {emails.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-1.5 text-sm last:border-0"
            >
              <span className="text-texto">
                {e.assunto}
                <span className="block text-xs text-cinza">
                  {e.para} · {quando(e.criadoEm)}
                  {e.anexos.length > 0 && ` · ${e.anexos.length} anexo(s)`}
                </span>
              </span>
              <span className={`text-xs ${e.status === "ENVIADO" ? "text-verde" : "text-negativo"}`}>
                {e.status === "ENVIADO" ? "Enviado" : `Erro: ${e.erro ?? "falha"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
