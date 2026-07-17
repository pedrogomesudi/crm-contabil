"use client";
import { useActionState } from "react";
import { salvarConfig, salvarCertificado, type EstadoConfig } from "./actions";
import { controleCls } from "@/components/ui/Campo";

export function FormConfig({ inicial }: { inicial: Record<string, string | boolean> }) {
  const [estado, action, pend] = useActionState<EstadoConfig, FormData>(salvarConfig, {});
  return (
    <form action={action} className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          CNPJ
          <input name="cnpj" defaultValue={String(inicial.cnpj)} required className={`${controleCls()} w-full`} />
        </label>
        <label className="block">
          Inscrição municipal
          <input name="im" defaultValue={String(inicial.im)} required className={`${controleCls()} w-full`} />
        </label>
        <label className="col-span-2 block">
          Razão social
          <input
            name="razao_social"
            defaultValue={String(inicial.razao_social)}
            required
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          Código do município (IBGE)
          <input
            name="codigo_municipio"
            defaultValue={String(inicial.codigo_municipio)}
            required
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          UF
          <input name="uf" defaultValue={String(inicial.uf)} required className={`${controleCls()} w-full`} />
        </label>
        <label className="block">
          Código de serviço nacional (cTribNac)
          <input
            name="codigo_servico_nacional"
            defaultValue={String(inicial.codigo_servico_nacional)}
            placeholder="ex.: 170201"
            required
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          Descrição do serviço
          <input
            name="descricao_servico"
            defaultValue={String(inicial.descricao_servico)}
            placeholder="Honorarios"
            required
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          Alíquota ISS (%) — se não Simples
          <input
            name="aliquota_iss"
            type="number"
            step="0.01"
            defaultValue={String(inicial.aliquota_iss)}
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          % aprox. tributos (Simples, pTotTribSN)
          <input
            name="pct_trib_sn"
            type="number"
            step="0.01"
            defaultValue={String(inicial.pct_trib_sn)}
            className={`${controleCls()} w-full`}
          />
        </label>
        <label className="block">
          Ambiente
          <select name="ambiente" defaultValue={String(inicial.ambiente)} className={`${controleCls()} w-full`}>
            <option value="homologacao">Homologação (produção restrita)</option>
            <option value="producao">Produção</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="simples" defaultChecked={Boolean(inicial.simples)} />
          Optante do Simples Nacional
        </label>
      </div>
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && <p className="text-verde">Configuração salva ✓</p>}
      <button
        disabled={pend}
        className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
      >
        {pend ? "Salvando..." : "Salvar configuração"}
      </button>
    </form>
  );
}

export function FormCertificado() {
  const [estado, action, pend] = useActionState<EstadoConfig, FormData>(salvarCertificado, {});
  return (
    <form action={action} className="space-y-2 text-sm">
      <label className="block">
        Arquivo .pfx / .p12
        <input name="pfx" type="file" accept=".pfx,.p12" required className={`${controleCls()} w-full`} />
      </label>
      <label className="block">
        Senha do certificado
        <input name="senha" type="password" required className={`${controleCls()} w-full`} />
      </label>
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && <p className="text-verde">Certificado salvo ✓</p>}
      <button
        disabled={pend}
        className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
      >
        {pend ? "Enviando..." : "Salvar certificado"}
      </button>
    </form>
  );
}
