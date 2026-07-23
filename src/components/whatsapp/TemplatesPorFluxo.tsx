"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import { POLITICA, PARAMS_FLUXO, type FluxoProativo } from "@/lib/whatsapp/politica-proativo";
import type { TemplateMeta, StatusTemplate } from "@/lib/whatsapp/templates-meta";
import { salvarTemplateFluxo } from "@/app/(app)/configuracoes/whatsapp/actions";

const ROTULO: Record<FluxoProativo, string> = {
  regua: "Régua de cobrança",
  cobranca_manual: "Cobrança manual",
  legalizacao: "Avisos de legalização",
  comunicado: "Comunicados",
  followup: "Follow-up de proposta",
  nfse: "NFS-e em lote",
};

const COR: Record<StatusTemplate | "nao_configurado", string> = {
  aprovado: "text-verde",
  pendente: "text-atencao",
  reprovado: "text-negativo",
  outro: "text-cinza",
  nao_configurado: "text-cinza",
};

// O contrato de parâmetros: a ORDEM é o que o escritório precisa respeitar ao escrever
// o template na Meta. Ex.: "{{1}} cliente · {{2}} valor · {{3}} vencimento".
const contrato = (fluxo: FluxoProativo) =>
  PARAMS_FLUXO[fluxo].map((p, i) => `{{${i + 1}}} ${p}`).join(" · ");

type Configurado = { nome: string; idioma: string };

export function TemplatesPorFluxo({
  configurados,
  disponiveis,
  erroListagem,
}: {
  configurados: Partial<Record<FluxoProativo, Configurado>>;
  disponiveis: TemplateMeta[];
  erroListagem: string | null;
}) {
  const fluxos = Object.keys(POLITICA) as FluxoProativo[];
  return (
    <section className="space-y-4 rounded-lg border border-linha bg-white p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-grafite">Templates por fluxo</h3>
        <p className="text-sm text-cinza">
          Fora da janela de 24h, a API oficial só envia por <strong>template aprovado</strong> pela Meta.
          Escreva o texto do template no Business Manager seguindo a ordem de parâmetros indicada em cada
          fluxo. A Z-API não usa templates — esta seção não a afeta.
        </p>
      </div>

      {erroListagem && (
        <p role="alert" className="rounded-lg bg-creme p-2 text-sm text-negativo">
          {erroListagem} Você ainda pode informar o nome do template <strong>à mão</strong> abaixo.
        </p>
      )}

      <ul className="space-y-3">
        {fluxos.map((f) => (
          <LinhaFluxo
            key={f}
            fluxo={f}
            atual={configurados[f] ?? null}
            disponiveis={disponiveis}
            manual={Boolean(erroListagem)}
          />
        ))}
      </ul>
    </section>
  );
}

function LinhaFluxo({
  fluxo,
  atual,
  disponiveis,
  manual,
}: {
  fluxo: FluxoProativo;
  atual: Configurado | null;
  disponiveis: TemplateMeta[];
  manual: boolean;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nomeManual, setNomeManual] = useState(atual?.nome ?? "");

  // O estado cruza o que está configurado com o que a Meta reporta agora.
  const naMeta = atual ? disponiveis.find((d) => d.nome === atual.nome && d.idioma === atual.idioma) : undefined;
  const status: StatusTemplate | "nao_configurado" = !atual ? "nao_configurado" : (naMeta?.status ?? "outro");
  const rotuloStatus = status === "nao_configurado" ? "não configurado" : status;

  const salvar = (nome: string, idioma: string) =>
    start(async () => {
      const r = await salvarTemplateFluxo(fluxo, nome, idioma);
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <li className="space-y-1 border-t border-linha pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-grafite">{ROTULO[fluxo]}</span>
        <span className={`text-xs ${COR[status]}`}>{rotuloStatus}</span>
        <span className="text-xs text-cinza">
          {POLITICA[fluxo] === "sempre_template" ? "sempre template" : "usa a janela de 24h quando houver"}
        </span>
      </div>
      <p className="font-mono text-xs text-cinza">{contrato(fluxo)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {manual ? (
          <>
            <input
              className={controleCls("compacto")}
              placeholder="nome do template"
              value={nomeManual}
              disabled={pend}
              onChange={(e) => setNomeManual(e.target.value)}
            />
            <Botao
              type="button"
              variante="secundario"
              disabled={pend || !nomeManual.trim()}
              onClick={() => salvar(nomeManual.trim(), atual?.idioma ?? "pt_BR")}
            >
              Salvar
            </Botao>
          </>
        ) : (
          <select
            className={controleCls("compacto")}
            value={atual ? `${atual.nome}|${atual.idioma}` : ""}
            disabled={pend}
            onChange={(e) => {
              const [nome, idioma] = e.target.value.split("|");
              if (nome && idioma) salvar(nome, idioma);
            }}
          >
            <option value="">sem template</option>
            {disponiveis.map((d) => (
              <option key={`${d.nome}|${d.idioma}`} value={`${d.nome}|${d.idioma}`}>
                {d.nome} ({d.idioma}) — {d.status}
              </option>
            ))}
          </select>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </li>
  );
}
