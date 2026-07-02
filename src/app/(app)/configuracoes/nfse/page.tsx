import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatarData } from "@/lib/format";
import { FormConfig, FormCertificado } from "./Formularios";

export default async function ConfigNfsePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("nfse_config").select("*").eq("id", 1).maybeSingle();
  const { data: cert } = await supabase
    .from("nfse_certificado")
    .select("nome_arquivo, validade")
    .eq("id", 1)
    .maybeSingle();

  const inicial = {
    cnpj: cfg?.cnpj ?? "",
    im: cfg?.inscricao_municipal ?? "",
    razao_social: cfg?.razao_social ?? "",
    codigo_municipio: cfg?.codigo_municipio ?? "3170206",
    uf: cfg?.uf ?? "MG",
    item_lc116: cfg?.item_lc116 ?? "17.19",
    codigo_trib: cfg?.codigo_tributacao_municipal ?? "",
    aliquota_iss: cfg?.aliquota_iss != null ? String(cfg.aliquota_iss) : "",
    natureza: cfg?.natureza_operacao ?? "1",
    simples: cfg?.simples_nacional ?? true,
    ambiente: cfg?.ambiente ?? "homologacao",
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-semibold text-slate-900">Configuração da NFS-e</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Dados fiscais do emitente</h2>
        <FormConfig inicial={inicial} />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Certificado digital A1</h2>
        {cert?.validade ? (
          <p className="text-sm text-slate-600">
            Atual: <strong>{cert.nome_arquivo}</strong> — válido até{" "}
            <time dateTime={cert.validade}>{formatarData(cert.validade)}</time>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Nenhum certificado cadastrado.</p>
        )}
        <FormCertificado />
      </section>
    </main>
  );
}
