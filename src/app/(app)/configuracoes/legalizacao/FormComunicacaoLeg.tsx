"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { salvarComunicacaoLeg, type ComunicacaoView } from "./comunicacao-actions";

export function FormComunicacaoLeg({ cfg }: { cfg: ComunicacaoView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function salvar(patch: Partial<ComunicacaoView>) {
    setOcupado(true);
    const atual = { ...cfg, ...patch };
    const r = await salvarComunicacaoLeg({
      canal: atual.canal as "email" | "whatsapp",
      ativo: atual.ativo,
      assunto: atual.assunto,
      template: atual.template,
    });
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="font-display text-sm font-semibold text-texto">Comunicação automática</h2>
      <div className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs text-cinza">
            Canal
            <select
              value={cfg.canal}
              disabled={ocupado}
              onChange={(e) => salvar({ canal: e.target.value })}
              className={`${controleCls("compacto")} mt-0.5 block w-40`}
            >
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-cinza">
            <input
              type="checkbox"
              checked={cfg.ativo}
              disabled={ocupado}
              onChange={(e) => salvar({ ativo: e.target.checked })}
            />
            Ativo
          </label>
        </div>
        {cfg.canal === "email" && (
          <label className="block text-xs text-cinza">
            Assunto (e-mail)
            <input
              defaultValue={cfg.assunto ?? ""}
              disabled={ocupado}
              onBlur={(e) => e.target.value !== (cfg.assunto ?? "") && salvar({ assunto: e.target.value || null })}
              className={`${controleCls("compacto")} mt-0.5 w-full`}
            />
          </label>
        )}
        <label className="block text-xs text-cinza">
          Mensagem
          <textarea
            defaultValue={cfg.template}
            disabled={ocupado}
            rows={3}
            onBlur={(e) =>
              e.target.value.trim() && e.target.value !== cfg.template && salvar({ template: e.target.value })
            }
            className={`${controleCls("compacto")} mt-0.5 w-full`}
          />
        </label>
        <p className="text-[11px] text-cinza">
          Variáveis: <code>{"{cliente}"}</code> <code>{"{processo}"}</code> <code>{"{etapa}"}</code>{" "}
          <code>{"{orgao}"}</code> <code>{"{protocolo}"}</code> <code>{"{data}"}</code>
        </p>
      </div>
    </section>
  );
}
