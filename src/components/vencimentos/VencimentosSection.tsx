import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { classificarVencimento, type Severidade } from "@/lib/vencimentos/alerta";
import { hojeEmSaoPaulo } from "@/lib/vencimentos/hoje";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { FormCertificado } from "./FormCertificado";
import { FormProcuracao } from "./FormProcuracao";
import { BotaoDesativar } from "./BotaoDesativar";

const CLASSE: Record<Severidade, string> = {
  vencido: "bg-negativo text-white",
  critico: "bg-negativo/15 text-negativo",
  alerta: "bg-atencao-fundo text-atencao",
  aviso: "bg-slate-100 text-cinza",
  ok: "bg-slate-100 text-cinza",
};
const ROTULO: Record<Severidade, string> = {
  vencido: "Vencido",
  critico: "Crítico",
  alerta: "Alerta",
  aviso: "Aviso",
  ok: "Ok",
};

function Selo({ validade, hoje }: { validade: string; hoje: string }) {
  const { severidade, diasRestantes } = classificarVencimento(validade, hoje);
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${CLASSE[severidade]}`}>
      {ROTULO[severidade]}
      {severidade !== "ok" && ` · ${diasRestantes} d`}
    </span>
  );
}

export async function VencimentosSection({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeGerenciarVencimentos(papel)) return null;
  const supabase = await createServerSupabase();
  const hoje = hojeEmSaoPaulo();

  const [{ data: certs }, { data: procs }, { data: nfse }] = await Promise.all([
    supabase
      .from("certificado_digital")
      .select("id, tipo, titular, emissao, validade, ativo")
      .eq("cliente_id", clienteId)
      .order("ativo", { ascending: false })
      .order("validade", { ascending: true }),
    supabase
      .from("procuracao")
      .select("id, orgao, outorgante, outorgado, validade, ativo")
      .eq("cliente_id", clienteId)
      .order("ativo", { ascending: false })
      .order("validade", { ascending: true }),
    supabase.from("nfse_certificado_cliente").select("validade").eq("cliente_id", clienteId).maybeSingle(),
  ]);

  return (
    <section className="space-y-4 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Certificados e procurações</h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-cinza">Certificados digitais</h3>
          <FormCertificado clienteId={clienteId} />
        </div>
        {nfse?.validade && (
          <div className="flex items-center justify-between rounded border border-linha bg-creme px-2 py-1 text-sm">
            <span className="text-cinza">Certificado A1 (NFS-e) — validade {formatarData(nfse.validade)}</span>
            <span className="flex items-center gap-2">
              <Selo validade={String(nfse.validade).slice(0, 10)} hoje={hoje} />
              <a href="/configuracoes/nfse" className="text-xs text-verde underline">
                origem: NFS-e
              </a>
            </span>
          </div>
        )}
        {certs?.length ? (
          <ul className="space-y-1 text-sm">
            {certs.map((c) => (
              <li
                key={c.id}
                className={`flex items-center justify-between rounded border border-linha px-2 py-1 ${c.ativo ? "" : "opacity-50"}`}
              >
                <span>
                  {c.tipo} · {c.titular} · vence {formatarData(c.validade)}
                  {!c.ativo && " (inativo)"}
                </span>
                {c.ativo && (
                  <span className="flex items-center gap-2">
                    <Selo validade={c.validade} hoje={hoje} />
                    <FormCertificado clienteId={clienteId} substituiId={c.id} />
                    <BotaoDesativar id={c.id} clienteId={clienteId} tipo="certificado" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cinza">Nenhum certificado cadastrado.</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-cinza">Procurações</h3>
          <FormProcuracao clienteId={clienteId} />
        </div>
        {procs?.length ? (
          <ul className="space-y-1 text-sm">
            {procs.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded border border-linha px-2 py-1 ${p.ativo ? "" : "opacity-50"}`}
              >
                <span>
                  {p.orgao} · {p.outorgante} · vence {formatarData(p.validade)}
                  {!p.ativo && " (inativa)"}
                </span>
                {p.ativo && (
                  <span className="flex items-center gap-2">
                    <Selo validade={p.validade} hoje={hoje} />
                    <FormProcuracao clienteId={clienteId} substituiId={p.id} />
                    <BotaoDesativar id={p.id} clienteId={clienteId} tipo="procuracao" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cinza">Nenhuma procuração cadastrada.</p>
        )}
      </div>
    </section>
  );
}
