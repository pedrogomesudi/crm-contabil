"use client";
import { controleCls } from "@/components/ui/Campo";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition } from "react";
import { salvarEtapa, setReguaAtiva, dispararReguaManual, type EtapaView, type EnvioView } from "./actions";

const campo = controleCls("compacto");

export function Regua({
  ativaInicial,
  etapas,
  historico,
}: {
  ativaInicial: boolean;
  etapas: EtapaView[];
  historico: EnvioView[];
}) {
  const [ativa, setAtiva] = useState(ativaInicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const r = await setReguaAtiva(!ativa);
      if (!r.erro) setAtiva(!ativa);
    });
  const processar = () =>
    start(async () => {
      const r = await dispararReguaManual();
      setMsg(
        r.erro ??
          (r.resumo
            ? `Processados ${r.resumo.processados}, enviados ${r.resumo.enviados} ` +
              `(WhatsApp ${r.resumo.enviadosWhatsapp}, e-mail ${r.resumo.enviadosEmail}), ` +
              `pulados ${r.resumo.pulados}, erros ${r.resumo.erros}. ${r.resumo.motivo ?? ""}`
            : ""),
      );
    });

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ativa} onChange={toggle} disabled={pend} />
          Régua automática {ativa ? "ativa" : "desligada"}
        </label>
        <button
          onClick={processar}
          disabled={pend}
          className="rounded-lg bg-verde px-3 py-1 font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          Processar agora
        </button>
      </div>
      {msg && <p className="text-cinza">{msg}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Etapas</h2>
        {etapas.map((e) => (
          <form
            key={e.id}
            action={async (fd) => {
              fd.set("id", e.id);
              const r = await salvarEtapa(fd);
              setMsg(r.erro ?? "Etapa salva.");
            }}
            className="space-y-2 rounded border border-linha p-2"
          >
            <div className="grid grid-cols-[1fr_5rem_1fr_4rem_auto] items-center gap-2">
              <input name="nome" defaultValue={e.nome} className={campo} />
              <input
                name="dias_offset"
                type="number"
                defaultValue={e.dias_offset}
                className={campo}
                title="dias (negativo=antes)"
              />
              <input name="template" defaultValue={e.template} className={campo} title="mensagem do WhatsApp" />
              <label className="flex items-center gap-1">
                <input type="checkbox" name="ativa" defaultChecked={e.ativa} /> ativa
              </label>
              <input type="hidden" name="ordem" defaultValue={e.ordem} />
              <button type="submit" className={controleCls("compacto")}>
                Salvar
              </button>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <input
                name="email_assunto"
                defaultValue={e.email_assunto ?? ""}
                placeholder="Assunto do e-mail (opcional)"
                className={campo}
              />
              <input
                name="email_corpo"
                defaultValue={e.email_corpo ?? ""}
                placeholder="Corpo do e-mail (opcional)"
                className={campo}
              />
            </div>
          </form>
        ))}
        <form
          action={async (fd) => {
            const r = await salvarEtapa(fd);
            setMsg(r.erro ?? "Etapa criada.");
          }}
          className="space-y-2 rounded border border-dashed border-linha p-2"
        >
          <div className="grid grid-cols-[1fr_5rem_1fr_4rem_auto] items-center gap-2">
            <input name="nome" placeholder="Nova etapa" className={campo} />
            <input name="dias_offset" type="number" placeholder="dias" className={campo} />
            <input
              name="template"
              placeholder="Mensagem do WhatsApp com {nome} {valor} {vencimento} {dias}"
              className={campo}
            />
            <label className="flex items-center gap-1">
              <input type="checkbox" name="ativa" defaultChecked /> ativa
            </label>
            <input type="hidden" name="ordem" defaultValue={etapas.length + 1} />
            <button type="submit" className="rounded-lg bg-verde px-2 py-1 font-medium text-white hover:brightness-105">
              Adicionar
            </button>
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <input name="email_assunto" placeholder="Assunto do e-mail (opcional)" className={campo} />
            <input name="email_corpo" placeholder="Corpo do e-mail (opcional)" className={campo} />
          </div>
        </form>
        <p className="text-xs text-cinza-claro">
          Variáveis: {"{nome}"}, {"{valor}"}, {"{vencimento}"}, {"{dias}"}. Deslocamento negativo = antes do vencimento.
          O e-mail só é usado quando o WhatsApp não entrega (não configurado, cliente sem telefone, opt-out ou erro do
          provedor) — e, se os campos de e-mail ficarem em branco, ele reaproveita a mensagem do WhatsApp.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Últimos envios da régua</h2>
        <table className="w-full">
          <tbody>
            {historico.map((h) => (
              <tr key={h.id} className="border-t border-linha/70">
                <td className="py-1">{h.cliente}</td>
                <td className="py-1">{h.etapa}</td>
                <td className="py-1 text-cinza">{h.canal}</td>
                <td className="py-1">
                  <Badge variante={h.status === "ENVIADO" ? "positivo" : "negativo"}>{h.status}</Badge>
                </td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr>
                <td className="py-1 text-cinza-claro">Nenhum envio ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
