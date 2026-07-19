"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/format";
import { rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { controleCls } from "@/components/ui/Campo";
import type { EstadoUpload } from "@/app/(app)/documentos/estados";
import { anexarNovaVersao } from "@/app/(app)/documentos/actions";
import { BotaoBaixar } from "./BotaoBaixar";
import { BotaoExcluirDocumento } from "./BotaoExcluirDocumento";
import { StatusAssinatura } from "@/components/assinatura/StatusAssinatura";
import { EnviarAssinatura } from "@/components/assinatura/EnviarAssinatura";

type DocItem = {
  id: string;
  nome: string;
  origem: string;
  enviado_em: string;
  visto: string | null;
  tipo: string | null;
  departamento: string | null;
  competencia: string | null;
  ehContrato: boolean;
  assinatura: { status: string; signatarios: { nome: string; papel: string; status: string }[] } | null;
  substitui_id: string | null;
  anteriores: DocItem[];
};

const dep = (d: string) => rotuloDepartamento(d as Departamento);

export function DocumentosTabela({
  docs,
  clienteId,
  clienteNome,
  clienteEmail,
  podeGerenciar,
  ehAdmin,
}: {
  docs: DocItem[];
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
  podeGerenciar: boolean;
  ehAdmin: boolean;
}) {
  const [depF, setDepF] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [compF, setCompF] = useState(""); // "YYYY-MM"

  const deps = useMemo(() => [...new Set(docs.map((d) => d.departamento).filter(Boolean))] as string[], [docs]);
  const tipos = useMemo(() => [...new Set(docs.map((d) => d.tipo).filter(Boolean))] as string[], [docs]);

  const filtrados = docs.filter(
    (d) =>
      (!depF || d.departamento === depF) &&
      (!tipoF || d.tipo === tipoF) &&
      (!compF || (d.competencia ?? "").startsWith(compF)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={depF} onChange={(e) => setDepF(e.target.value)} className={controleCls("compacto")}>
          <option value="">todos os departamentos</option>
          {deps.map((d) => (
            <option key={d} value={d}>
              {dep(d)}
            </option>
          ))}
        </select>
        <select value={tipoF} onChange={(e) => setTipoF(e.target.value)} className={controleCls("compacto")}>
          <option value="">todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={compF}
          onChange={(e) => setCompF(e.target.value)}
          className={controleCls("compacto")}
        />
      </div>

      <div className="overflow-hidden rounded border border-linha">
        <table className="w-full text-sm">
          <caption className="sr-only">Documentos do cliente</caption>
          <thead className="bg-creme text-left text-cinza">
            <tr>
              <th className="p-2 font-medium">Nome</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Departamento</th>
              <th className="p-2 font-medium">Competência</th>
              <th className="p-2 font-medium">Enviado em</th>
              <th className="p-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((d) => (
              <tr key={d.id} className="border-t border-linha/70 align-top">
                <td className="p-2 text-texto">
                  {d.nome}
                  {d.origem === "cliente" && (
                    <span className="ml-2 rounded-full bg-violeta/10 px-2 py-0.5 text-xs text-violeta">
                      enviado pelo cliente
                    </span>
                  )}
                  <span className="ml-2 text-xs text-cinza">
                    {d.visto ? `· visto em ${formatarData(d.visto)}` : "· não visualizado"}
                  </span>
                  {d.anteriores.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-cinza">
                        {d.anteriores.length} versões anteriores
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {d.anteriores.map((a) => (
                          <li key={a.id} className="flex items-center gap-2 text-xs text-cinza">
                            <span>{a.nome}</span>
                            <time dateTime={a.enviado_em}>{formatarData(a.enviado_em)}</time>
                            <BotaoBaixar documentoId={a.id} nome={a.nome} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
                <td className="p-2 text-cinza">{d.departamento ? dep(d.departamento) : "—"}</td>
                <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
                <td className="p-2 text-cinza">
                  <time dateTime={d.enviado_em}>{formatarData(d.enviado_em)}</time>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <BotaoBaixar documentoId={d.id} nome={d.nome} />
                    {ehAdmin && <BotaoExcluirDocumento documentoId={d.id} clienteId={clienteId} nome={d.nome} />}
                  </div>
                  {d.ehContrato && podeGerenciar && (
                    <div className="mt-2 space-y-2">
                      {d.assinatura && (
                        <StatusAssinatura status={d.assinatura.status} signatarios={d.assinatura.signatarios} />
                      )}
                      {(!d.assinatura || d.assinatura.status === "recusado" || d.assinatura.status === "cancelado") && (
                        <EnviarAssinatura
                          documentoId={d.id}
                          clienteId={clienteId}
                          clienteNome={clienteNome}
                          clienteEmail={clienteEmail}
                        />
                      )}
                    </div>
                  )}
                  {podeGerenciar && <NovaVersao documentoId={d.id} />}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="p-3 text-center text-cinza-claro">
                  Nenhum documento com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NovaVersao({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(
    anexarNovaVersao.bind(null, documentoId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [estado.ok, router]);
  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        name="arquivo"
        type="file"
        required
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className={controleCls("compacto")}
      />
      <button type="submit" disabled={pending} className="text-xs text-verde underline disabled:opacity-60">
        {pending ? "Enviando..." : "Nova versão"}
      </button>
      {estado.erro && <span className="text-xs text-negativo">{estado.erro}</span>}
    </form>
  );
}
