"use client";
import { controleCls } from "@/components/ui/Campo";
import { useActionState } from "react";
import { salvarEmitente, salvarCertificadoCliente, type EstadoEmitente } from "@/app/(app)/clientes/[id]/nfse-emitente";
import { certificadoValido } from "@/lib/nfse/emitente";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

type EmitenteDefaults = {
  codigo_municipio?: string | null;
  item_lc116?: string | null;
  codigo_servico_nacional?: string | null;
  codigo_tributacao_municipal?: string | null;
  aliquota_iss?: number | null;
  pct_trib_sn?: number | null;
  simples_nacional?: boolean | null;
  natureza_operacao?: string | null;
  descricao_servico_padrao?: string | null;
  serie?: string | null;
  proximo_ndps?: number | null;
  ambiente?: string | null;
} | null;

export function EmitenteConfig({
  clienteId,
  emitente,
  certificadoValidade,
}: {
  clienteId: string;
  emitente: EmitenteDefaults;
  certificadoValidade: string | null;
}) {
  const [estado, action, pend] = useActionState<EstadoEmitente, FormData>(salvarEmitente.bind(null, clienteId), {});
  const [estadoCert, actionCert, pendCert] = useActionState<EstadoEmitente, FormData>(
    salvarCertificadoCliente.bind(null, clienteId),
    {},
  );
  const expirado = certificadoValidade ? !certificadoValido(certificadoValidade) : false;

  return (
    <div className="space-y-4">
      <form action={action} className="text-sm">
        <FormGrid>
          <FormCampo label="Código do município (IBGE)" span={4}>
            <input
              name="codigo_municipio"
              defaultValue={emitente?.codigo_municipio ?? ""}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Item LC 116" span={4}>
            <input name="item_lc116" defaultValue={emitente?.item_lc116 ?? ""} className={`${controleCls()} w-full`} />
          </FormCampo>
          <FormCampo label="Código de serviço nacional (cTribNac)" span={4}>
            <input
              name="codigo_servico_nacional"
              defaultValue={emitente?.codigo_servico_nacional ?? ""}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Código de tributação municipal" span={6}>
            <input
              name="codigo_tributacao_municipal"
              defaultValue={emitente?.codigo_tributacao_municipal ?? ""}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Alíquota ISS (%)" span={3}>
            <input
              type="number"
              step="0.01"
              name="aliquota_iss"
              defaultValue={emitente?.aliquota_iss ?? 0}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="% tributos (Simples)" span={3}>
            <input
              type="number"
              step="0.01"
              name="pct_trib_sn"
              defaultValue={emitente?.pct_trib_sn ?? 0}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Natureza da operação" span={6}>
            <input
              name="natureza_operacao"
              defaultValue={emitente?.natureza_operacao ?? ""}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Descrição de serviço padrão" span={6}>
            <input
              name="descricao_servico_padrao"
              defaultValue={emitente?.descricao_servico_padrao ?? ""}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Série" span={2}>
            <input name="serie" defaultValue={emitente?.serie ?? "1"} className={`${controleCls()} w-full`} />
          </FormCampo>
          <FormCampo
            label="Próximo nº da DPS"
            span={4}
            hint="Ajuste ao migrar de outro sistema (nº seguinte ao último já emitido)."
          >
            <input
              type="number"
              min="1"
              step="1"
              name="proximo_ndps"
              defaultValue={emitente?.proximo_ndps ?? 1}
              className={`${controleCls()} w-full`}
            />
          </FormCampo>
          <FormCampo label="Ambiente" span={4}>
            <select
              name="ambiente"
              defaultValue={emitente?.ambiente ?? "homologacao"}
              className={`${controleCls()} w-full`}
            >
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
          </FormCampo>
          <div className="flex items-center gap-2 md:col-span-12">
            <input type="checkbox" name="simples" defaultChecked={emitente?.simples_nacional ?? true} />
            Optante do Simples Nacional
          </div>
        </FormGrid>
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={pend}
            className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
          >
            {pend ? "Salvando…" : "Salvar dados do emitente"}
          </button>
          {estado.ok && <span className="text-xs text-verde">Salvo ✓</span>}
          {estado.erro && (
            <span role="alert" className="text-xs text-negativo">
              {estado.erro}
            </span>
          )}
        </div>
      </form>

      <form action={actionCert} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="block">
          Certificado A1 (.pfx)
          <input type="file" name="pfx" accept=".pfx,.p12" className="mt-1 block text-xs" />
        </label>
        <label className="block">
          Senha
          <input type="password" name="senha" className={`${controleCls()} mt-1`} />
        </label>
        <button disabled={pendCert} className="rounded border px-3 py-1 disabled:opacity-60">
          {pendCert ? "Enviando…" : "Enviar certificado"}
        </button>
        {certificadoValidade && (
          <span className={`text-xs ${expirado ? "text-negativo" : "text-cinza-claro"}`}>
            Validade: {new Date(certificadoValidade).toLocaleDateString("pt-BR")}
            {expirado ? " (expirado)" : ""}
          </span>
        )}
        {estadoCert.ok && <span className="text-xs text-verde">Certificado salvo ✓</span>}
        {estadoCert.erro && (
          <span role="alert" className="text-xs text-negativo">
            {estadoCert.erro}
          </span>
        )}
      </form>
    </div>
  );
}
