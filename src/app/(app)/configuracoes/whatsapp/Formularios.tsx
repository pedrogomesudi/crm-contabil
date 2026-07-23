"use client";
import { controleCls } from "@/components/ui/Campo";
import { useActionState, useState, useTransition } from "react";
import { salvarConfigWhatsapp, testarConexao, type EstadoWa } from "./actions";

export function FormWhatsapp({
  provedor,
  instance,
  zapiConfigurado,
  oficialPhoneNumberId,
  oficialConfigurado,
  oficialAppSecretConfigurado,
  oficialVerifyToken,
  oficialWabaId,
}: {
  provedor: string;
  instance: string;
  zapiConfigurado: boolean;
  oficialPhoneNumberId: string;
  oficialConfigurado: boolean;
  oficialAppSecretConfigurado: boolean;
  oficialVerifyToken: string;
  oficialWabaId: string;
}) {
  const [estado, action, pend] = useActionState<EstadoWa, FormData>(salvarConfigWhatsapp, {});
  const [prov, setProv] = useState(provedor === "oficial" ? "oficial" : "zapi");
  const [teste, setTeste] = useState<string | null>(null);
  const [pendT, start] = useTransition();

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-cinza">Provedor</span>
        <select value={prov} onChange={(e) => setProv(e.target.value)} className={`${controleCls()} mt-1 w-full`}>
          <option value="zapi">Z-API (não-oficial)</option>
          <option value="oficial">API oficial (WhatsApp Cloud API)</option>
        </select>
      </label>

      <form action={action} className="space-y-3">
        <input type="hidden" name="provedor" value={prov} />

        {prov === "zapi" ? (
          <>
            <p className="rounded border border-atencao-borda bg-atencao-fundo px-3 py-2 text-xs text-atencao">
              ⚠️ O Z-API é <strong>não-oficial</strong> (usa o WhatsApp Web). Use um <strong>número dedicado</strong> —
              há risco de banimento do número.
            </p>
            <label className="block text-sm">
              <span className="text-cinza">Instance ID</span>
              <input name="instance" defaultValue={instance} className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                Token da instância {zapiConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">Client-Token (segurança da conta)</span>
              <input name="client_token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
          </>
        ) : (
          <>
            <p className="rounded border border-atencao-borda bg-atencao-fundo px-3 py-2 text-xs text-atencao">
              A API oficial exige <strong>templates aprovados</strong> para mensagens fora da janela de 24h. Vincule um
              template a cada fluxo na seção <strong>Templates por fluxo</strong>, abaixo.
            </p>
            <label className="block text-sm">
              <span className="text-cinza">Phone Number ID</span>
              <input
                name="oficial_phone_number_id"
                defaultValue={oficialPhoneNumberId}
                className={`${controleCls()} mt-1 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">WABA ID (conta do WhatsApp Business — para listar os templates)</span>
              <input name="oficial_waba_id" defaultValue={oficialWabaId} className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                Token permanente {oficialConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="oficial_token" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">Verify Token (defina um segredo e cole no App da Meta)</span>
              <input
                name="oficial_verify_token"
                defaultValue={oficialVerifyToken}
                className={`${controleCls()} mt-1 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-cinza">
                App Secret {oficialAppSecretConfigurado && "(configurado — deixe em branco para manter)"}
              </span>
              <input name="oficial_app_secret" type="password" className={`${controleCls()} mt-1 w-full`} />
            </label>
            <p className="rounded border border-linha bg-creme px-3 py-2 text-xs text-cinza">
              URL do webhook (cole no App da Meta):{" "}
              <code className="break-all">
                {(process.env.NEXT_PUBLIC_SITE_URL ?? "") + "/api/webhooks/whatsapp-oficial"}
              </code>
            </p>
          </>
        )}

        {estado.erro && <p className="text-sm text-negativo">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-verde">Salvo.</p>}
        <button
          type="submit"
          disabled={pend}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pend ? "Salvando…" : "Salvar"}
        </button>
      </form>

      <button
        onClick={() =>
          start(async () => {
            const r = await testarConexao();
            setTeste(r.erro ?? (r.conectado ? "Conectado ✓" : "Não conectado."));
          })
        }
        disabled={pendT}
        className="rounded border border-linha px-4 py-2 text-sm"
      >
        {pendT ? "Testando…" : "Testar conexão"}
      </button>
      {teste && <p className="text-sm text-cinza">{teste}</p>}
    </div>
  );
}
