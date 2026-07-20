import { prontidaoBoleto, type ConfigBoletoView } from "@/lib/boleto/config";
import type { StatusWebhook } from "@/lib/boleto/webhook";
import { BotaoWebhook } from "./BotaoWebhook";

export function PainelProntidao({
  config,
  webhookSecretDefinido,
  appUrl,
  statusWebhook,
}: {
  config: ConfigBoletoView;
  webhookSecretDefinido: boolean;
  appUrl: string | null;
  statusWebhook: StatusWebhook | "indisponivel";
}) {
  const itens = prontidaoBoleto(config, webhookSecretDefinido);
  const base = (appUrl ?? "https://app.seusaldo.ai").replace(/\/+$/, "");
  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-grafite">Prontidão da configuração</h2>
      <ul className="space-y-1 text-sm">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-center gap-2">
            <span className={i.ok ? "text-verde" : "text-negativo"}>{i.ok ? "✓" : "✗"}</span>
            <span className={i.ok ? "text-texto" : "text-cinza"}>{i.rotulo}</span>
          </li>
        ))}
      </ul>
      {config.provedor !== "nenhum" && (
        <div className="space-y-1 border-t border-linha pt-3 text-xs text-cinza">
          <p className="font-medium text-grafite">URL do webhook a cadastrar no provedor</p>
          <code className="block break-all rounded bg-creme px-2 py-1 text-texto">
            {base}/api/webhooks/boleto/&lt;BOLETO_WEBHOOK_SECRET&gt;
          </code>
          <p>Troque &lt;BOLETO_WEBHOOK_SECRET&gt; pelo valor definido no ambiente (não é exibido aqui).</p>
        </div>
      )}
      {config.provedor === "inter" && (
        <div className="space-y-2 border-t border-linha pt-3 text-xs text-cinza">
          <p>
            {statusWebhook === "ok"
              ? "✓ Webhook cadastrado no Inter (aponta para o SALDO)."
              : statusWebhook === "divergente"
                ? "⚠ Um webhook diferente está cadastrado no Inter."
                : statusWebhook === "ausente"
                  ? "✗ Webhook não cadastrado no Inter — a baixa automática não vai disparar."
                  : "Status do webhook indisponível."}
          </p>
          <BotaoWebhook />
        </div>
      )}
    </section>
  );
}
