"use client";
import { useActionState, useState } from "react";
import {
  salvarModeloProposta,
  enviarTemplateProposta,
  baixarExemploHtml,
  type EstadoProposta,
} from "./proposta-actions";
import { TAGS_DISPONIVEIS } from "@/lib/comercial/proposta-template";

const GRUPOS = [...new Set(TAGS_DISPONIVEIS.map((t) => t.grupo))];

export function FormProposta({
  modelo,
  templateTipo,
  temTemplate,
}: {
  modelo: "padrao" | "proprio";
  templateTipo: "docx" | "html" | null;
  temTemplate: boolean;
}) {
  const [estModelo, salvarModelo, pendModelo] = useActionState<EstadoProposta, FormData>(salvarModeloProposta, {});
  const [estUp, enviar, pendUp] = useActionState<EstadoProposta, FormData>(enviarTemplateProposta, {});
  const [baixando, setBaixando] = useState(false);

  async function baixarExemplo() {
    setBaixando(true);
    const html = await baixarExemploHtml();
    setBaixando(false);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-exemplo-proposta.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-linha bg-white p-4">
      <div>
        <h2 className="font-display text-base font-semibold text-texto">Proposta</h2>
        <p className="text-sm text-cinza">Modelo usado ao gerar a proposta comercial.</p>
      </div>

      <form action={salvarModelo} className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="modelo" value="padrao" defaultChecked={modelo === "padrao"} />
          Modelo padrão da plataforma <span className="text-cinza">(usa a Marca acima)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="modelo" value="proprio" defaultChecked={modelo === "proprio"} />
          Meu modelo enviado{" "}
          {temTemplate ? (
            <span className="text-cinza">({templateTipo})</span>
          ) : (
            <span className="text-negativo">(nenhum modelo enviado ainda)</span>
          )}
        </label>
        <div className="flex items-center gap-3">
          <button disabled={pendModelo} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            {pendModelo ? "Salvando…" : "Salvar escolha"}
          </button>
          {estModelo.ok && <span className="text-xs text-verde">Salvo ✓</span>}
          {estModelo.erro && (
            <span role="alert" className="text-xs text-negativo">
              {estModelo.erro}
            </span>
          )}
        </div>
      </form>

      <form action={enviar} className="space-y-2 rounded-lg border border-linha p-3 text-sm">
        <p className="font-medium text-texto">Enviar meu modelo</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" name="template" accept=".docx,.html,.htm" className="text-xs" />
          <button disabled={pendUp} className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-60">
            {pendUp ? "Enviando…" : "Enviar modelo"}
          </button>
        </div>
        <p className="text-xs text-cinza">
          Word (.docx) ou HTML estático, até 5 MB. Use as tags abaixo onde os campos devem entrar.
        </p>
        {estUp.ok && (
          <p className="text-xs text-verde">
            Modelo salvo ✓ {estUp.tagsOk?.length ? `— ${estUp.tagsOk.length} tag(s) reconhecida(s)` : ""}
          </p>
        )}
        {estUp.erro && (
          <p role="alert" className="text-xs text-negativo">
            {estUp.erro}
          </p>
        )}
        {estUp.tagsDesconhecidas && estUp.tagsDesconhecidas.length > 0 && (
          <p className="text-xs text-amber-700">
            Tags não reconhecidas (ficarão vazias): {estUp.tagsDesconhecidas.map((t) => `{${t}}`).join(", ")}
          </p>
        )}
        {estUp.avisos?.map((a, i) => (
          <p key={i} className="text-xs text-amber-700">
            {a}
          </p>
        ))}
      </form>

      <div className="space-y-2 rounded-lg bg-creme p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-texto">Tags disponíveis</p>
          <button
            type="button"
            onClick={baixarExemplo}
            disabled={baixando}
            className="text-xs text-verde underline disabled:opacity-60"
          >
            Baixar exemplo (HTML)
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {GRUPOS.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold text-cinza">{g}</p>
              <ul className="mt-0.5 space-y-0.5">
                {TAGS_DISPONIVEIS.filter((t) => t.grupo === g).map((t) => (
                  <li key={t.tag} className="text-xs text-texto">
                    <code className="rounded bg-white px-1">{`{${t.tag}}`}</code>{" "}
                    <span className="text-cinza">{t.rotulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-xs font-semibold text-cinza">Itens (bloco repetido)</p>
            <p className="mt-0.5 text-xs text-texto">
              <code className="rounded bg-white px-1">{`{#itens}…{/itens}`}</code> com{" "}
              <code className="rounded bg-white px-1">{`{descricao}`}</code>{" "}
              <code className="rounded bg-white px-1">{`{recorrencia}`}</code>{" "}
              <code className="rounded bg-white px-1">{`{valor}`}</code>
            </p>
          </div>
        </div>
        <p className="text-xs text-cinza">No Word (.docx), copie a tag e cole onde o campo deve aparecer.</p>
      </div>
    </section>
  );
}
