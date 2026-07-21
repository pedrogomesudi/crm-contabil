"use client";
import { useEffect, useState } from "react";
import { responderNps } from "./nps-actions";

const CHAVE = "nps_dispensado_ate";
const DIAS_ADIAMENTO = 7;

export function CardNps({ pergunta }: { pergunta: string }) {
  const [visivel, setVisivel] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    // Revela só após montar: o SSR renderiza oculto e o localStorage (client-only) decide
    // aqui, evitando mismatch de hidratação. É o caso que a regra abaixo super-restringe.
    const ate = Number(localStorage.getItem(CHAVE) ?? 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Date.now() > ate) setVisivel(true);
  }, []);

  if (!visivel) return null;

  async function enviar() {
    if (nota === null) return;
    setOcupado(true);
    const r = await responderNps(nota, comentario);
    setOcupado(false);
    if ("erro" in r) return alert(r.erro);
    setVisivel(false); // servidor revalida; não reaparece até renovar a periodicidade
  }

  function agoraNao() {
    localStorage.setItem(CHAVE, String(Date.now() + DIAS_ADIAMENTO * 86400000));
    setVisivel(false);
  }

  return (
    <section className="rounded-2xl border border-verde/40 bg-creme p-4">
      <p className="text-sm font-medium text-texto">{pergunta}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            aria-pressed={nota === n}
            className={`size-9 rounded-lg text-sm tabular-nums ${
              nota === n ? "bg-verde text-white" : "bg-white text-texto hover:bg-white/70"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Quer comentar? (opcional)"
        className="mt-3 block w-full rounded-lg bg-white p-2 text-sm text-texto"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={nota === null || ocupado}
          className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Responder
        </button>
        <button type="button" onClick={agoraNao} className="rounded-lg px-3 py-1.5 text-sm text-cinza">
          Agora não
        </button>
      </div>
    </section>
  );
}
