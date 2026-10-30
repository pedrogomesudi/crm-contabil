"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ativarEmpresa } from "@/app/(app)/clientes/constituicao-actions";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

const input = `${controleCls("compacto")} mt-0.5 w-full`;

export function AtivarEmpresa({ clienteId, regimeAtual }: { clienteId: string; regimeAtual: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await ativarEmpresa(clienteId, new FormData(e.currentTarget));
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-verde/40 bg-verde/5 p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Ativar empresa</h2>
      <p className="mt-0.5 text-xs text-cinza">Quando o CNPJ for emitido, informe os dados para ativar o cliente.</p>
      <form onSubmit={enviar} className="mt-2 text-sm">
        <FormGrid>
          <FormCampo label="CNPJ" span={4}>
            <input name="cpf_cnpj" required className={input} />
          </FormCampo>
          <FormCampo label="Regime" span={3}>
            <select name="regime_tributario" defaultValue={regimeAtual} className={input}>
              <option value="Simples">Simples</option>
              <option value="Presumido">Presumido</option>
              <option value="Real">Real</option>
            </select>
          </FormCampo>
          <FormCampo label="Inscrição estadual" span={3}>
            <input name="inscricao_estadual" className={input} />
          </FormCampo>
          <FormCampo label="Inscrição municipal" span={2}>
            <input name="inscricao_municipal" className={input} />
          </FormCampo>
        </FormGrid>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={ocupado} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            {ocupado ? "Ativando…" : "Ativar empresa"}
          </button>
          {erro && (
            <span role="alert" className="text-xs text-negativo">
              {erro}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
