"use client";
import { useActionState, useState, useTransition } from "react";
import { salvarConfigEmail, enviarTeste, setReguaFallback, type EstadoEmail, type StatusEmail } from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

export function FormEmail({ status, emailAdmin }: { status: StatusEmail; emailAdmin: string }) {
  const [provedor, setProvedor] = useState<"smtp" | "api">(status.provedor ?? "smtp");
  const [est, salvar, pend] = useActionState<EstadoEmail, FormData>(salvarConfigEmail, {});
  const [estTeste, testar, pendTeste] = useActionState<EstadoEmail, FormData>(enviarTeste, {});
  const [fallback, setFallback] = useState(status.reguaFallback);
  const [pendFallback, iniciarFallback] = useTransition();

  return (
    <div className="space-y-4">
      <form action={salvar} className="space-y-4 rounded-2xl border border-linha bg-white p-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-texto">Canal de envio</h2>
          <p className="text-xs text-cinza">
            Os e-mails saem do <strong>seu</strong> domínio, com a sua credencial. Ela é cifrada e nunca volta
            para a tela.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          {(["smtp", "api"] as const).map((p) => (
            <label key={p} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="provedor"
                value={p}
                checked={provedor === p}
                onChange={() => setProvedor(p)}
              />
              {p === "smtp" ? "SMTP (e-mail que você já tem)" : "API (Resend ou SendGrid)"}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-cinza">
            Nome do remetente
            <input name="remetente_nome" defaultValue={status.remetenteNome} placeholder="Escritório Contábil" className={`mt-0.5 block ${cls}`} />
          </label>
          <label className="text-xs text-cinza">
            E-mail do remetente
            <input name="remetente_email" type="email" required defaultValue={status.remetenteEmail} placeholder="contato@seudominio.com.br" className={`mt-0.5 block w-64 ${cls}`} />
          </label>
        </div>

        {provedor === "smtp" ? (
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Host
              <input name="smtp_host" defaultValue={status.smtpHost} placeholder="smtp.gmail.com" className={`mt-0.5 block w-56 ${cls}`} />
            </label>
            <label className="text-xs text-cinza">
              Porta
              <input name="smtp_porta" type="number" defaultValue={status.smtpPorta} className={`mt-0.5 block w-24 ${cls}`} />
            </label>
            <label className="mt-5 flex items-center gap-1.5 text-xs text-cinza">
              <input type="checkbox" name="smtp_seguro" defaultChecked={status.smtpSeguro} /> TLS
            </label>
            <label className="text-xs text-cinza">
              Usuário
              <input name="smtp_usuario" defaultValue={status.smtpUsuario} className={`mt-0.5 block w-56 ${cls}`} />
            </label>
            <label className="text-xs text-cinza">
              Senha
              <input name="smtp_senha" type="password" autoComplete="new-password" placeholder={status.temSenha ? "•••••• (configurada)" : ""} className={`mt-0.5 block w-56 ${cls}`} />
              <span className="mt-0.5 block text-[11px] text-cinza-claro">
                {status.temSenha ? "Deixe em branco para manter a atual." : "Obrigatória no primeiro salvamento."}
              </span>
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Provedor
              <select name="api_provedor" defaultValue={status.apiProvedor ?? "resend"} className={`mt-0.5 block ${cls}`}>
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </label>
            <label className="text-xs text-cinza">
              Chave de API
              <input name="api_chave" type="password" autoComplete="new-password" placeholder={status.temChave ? "•••••• (configurada)" : "re_..."} className={`mt-0.5 block w-72 ${cls}`} />
              <span className="mt-0.5 block text-[11px] text-cinza-claro">
                {status.temChave ? "Deixe em branco para manter a atual." : "O domínio precisa estar verificado no provedor."}
              </span>
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button disabled={pend} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60">
            {pend ? "Salvando…" : "Salvar"}
          </button>
          {est.ok && <span className="text-xs text-verde">Configuração salva.</span>}
          {est.erro && <span role="alert" className="text-xs text-negativo">{est.erro}</span>}
        </div>
      </form>

      <div className="space-y-2 rounded-2xl border border-linha bg-white p-4">
        <h2 className="font-display text-sm font-semibold text-texto">Régua de cobrança</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fallback}
            disabled={pendFallback}
            onChange={() =>
              iniciarFallback(async () => {
                const r = await setReguaFallback(!fallback);
                if (!r.erro) setFallback(!fallback);
              })
            }
          />
          Usar e-mail como fallback da régua
        </label>
        <p className="text-xs text-cinza">
          A cobrança sai por e-mail quando o WhatsApp não entrega: canal não configurado, cliente sem telefone,
          opt-out de WhatsApp ou erro do provedor. O cliente nunca recebe pelos dois.
        </p>
      </div>

      <form action={testar} className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-texto">Enviar e-mail de teste</h2>
          <p className="text-xs text-cinza">Confirme que o canal funciona antes de usá-lo com clientes.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-cinza">
            Enviar para
            <input name="para" type="email" defaultValue={emailAdmin} className={`mt-0.5 block w-64 ${cls}`} />
          </label>
          <button disabled={pendTeste} className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza disabled:opacity-60">
            {pendTeste ? "Enviando…" : "Enviar teste"}
          </button>
        </div>
        {estTeste.enviado && <p className="text-xs text-verde">E-mail enviado. Confira a caixa de entrada.</p>}
        {estTeste.erro && <p role="alert" className="text-xs text-negativo">{estTeste.erro}</p>}
      </form>
    </div>
  );
}
