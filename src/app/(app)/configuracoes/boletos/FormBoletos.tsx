"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarConfigBoleto } from "./actions";
import type { ConfigBoletoView } from "@/lib/boleto/config";
import { Botao } from "@/components/ui/Botao";

type Prov = "nenhum" | "inter" | "asaas";
const inputCls = "mt-0.5 w-full rounded-lg border border-linha px-2 py-1.5 text-sm";

export function FormBoletos({ config, contas }: { config: ConfigBoletoView; contas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [provedor, setProvedor] = useState<Prov>(config.provedor);
  const [asaasAmbiente, setAsaasAmbiente] = useState<"sandbox" | "producao">(config.asaasAmbiente);
  const [interConta, setInterConta] = useState(config.interContaCorrente ?? "");
  const [contaBancariaId, setContaBancariaId] = useState(config.contaBancariaId ?? "");
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [interClientId, setInterClientId] = useState("");
  const [interClientSecret, setInterClientSecret] = useState("");
  const [interCert, setInterCert] = useState("");
  const [interKey, setInterKey] = useState("");

  const ph = (definida: boolean) => (definida ? "•••• já definida — deixe em branco para manter" : "");

  async function salvar() {
    setOcupado(true);
    const r = await salvarConfigBoleto({
      provedor,
      asaasAmbiente,
      interContaCorrente: interConta || null,
      contaBancariaId: contaBancariaId || null,
      asaasApiKey: asaasApiKey || null,
      interClientId: interClientId || null,
      interClientSecret: interClientSecret || null,
      interCert: interCert || null,
      interKey: interKey || null,
    });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    alert("Configuração salva.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-creme px-3 py-2 text-xs text-cinza">
        A emissão de boletos entra nas próximas etapas; aqui você só escolhe e configura o provedor.
      </p>

      <label className="block text-sm text-cinza">
        Provedor
        <select value={provedor} onChange={(e) => setProvedor(e.target.value as Prov)} className={inputCls}>
          <option value="nenhum">Nenhum</option>
          <option value="asaas">Asaas</option>
          <option value="inter">Banco Inter</option>
        </select>
      </label>

      {provedor === "asaas" && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-sm font-semibold text-texto">Asaas</h3>
          <label className="block text-xs text-cinza">
            API key
            <input
              type="password"
              value={asaasApiKey}
              onChange={(e) => setAsaasApiKey(e.target.value)}
              placeholder={ph(config.asaasApiKeyDefinida)}
              className={inputCls}
            />
          </label>
          <label className="block text-xs text-cinza">
            Ambiente
            <select
              value={asaasAmbiente}
              onChange={(e) => setAsaasAmbiente(e.target.value as "sandbox" | "producao")}
              className={inputCls}
            >
              <option value="producao">Produção</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </label>
        </div>
      )}

      {provedor === "inter" && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-sm font-semibold text-texto">Banco Inter</h3>
          <label className="block text-xs text-cinza">
            Client ID
            <input
              type="password"
              value={interClientId}
              onChange={(e) => setInterClientId(e.target.value)}
              placeholder={ph(config.interClientIdDefinido)}
              className={inputCls}
            />
          </label>
          <label className="block text-xs text-cinza">
            Client Secret
            <input
              type="password"
              value={interClientSecret}
              onChange={(e) => setInterClientSecret(e.target.value)}
              placeholder={ph(config.interClientSecretDefinido)}
              className={inputCls}
            />
          </label>
          <label className="block text-xs text-cinza">
            Conta corrente
            <input value={interConta} onChange={(e) => setInterConta(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-cinza">
            Certificado (PEM)
            <textarea
              value={interCert}
              onChange={(e) => setInterCert(e.target.value)}
              rows={3}
              placeholder={ph(config.interCertDefinido) || "-----BEGIN CERTIFICATE-----"}
              className={inputCls}
            />
          </label>
          <label className="block text-xs text-cinza">
            Chave (PEM)
            <textarea
              value={interKey}
              onChange={(e) => setInterKey(e.target.value)}
              rows={3}
              placeholder={ph(config.interKeyDefinida) || "-----BEGIN PRIVATE KEY-----"}
              className={inputCls}
            />
          </label>
        </div>
      )}

      <label className="block text-sm text-cinza">
        Conta de recebimento
        <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end">
        <Botao variante="primario" disabled={ocupado} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </div>
  );
}
