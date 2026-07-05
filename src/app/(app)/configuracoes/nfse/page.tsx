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
    codigo_servico_nacional: cfg?.codigo_servico_nacional ?? "170201",
    descricao_servico: cfg?.descricao_servico ?? "Honorarios",
    aliquota_iss: cfg?.aliquota_iss != null ? String(cfg.aliquota_iss) : "",
    pct_trib_sn: cfg?.pct_trib_sn != null ? String(cfg.pct_trib_sn) : "",
    simples: cfg?.simples_nacional ?? true,
    ambiente: cfg?.ambiente ?? "homologacao",
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Configuração da NFS-e</h1>

      <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-texto">Dados fiscais do emitente</h2>
        <FormConfig inicial={inicial} />
      </section>

      <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-texto">Certificado digital A1</h2>
        {cert?.validade ? (
          <p className="text-sm text-cinza">
            Atual: <strong>{cert.nome_arquivo}</strong> — válido até{" "}
            <time dateTime={cert.validade}>{formatarData(cert.validade)}</time>
          </p>
        ) : (
          <p className="text-sm text-cinza-claro">Nenhum certificado cadastrado.</p>
        )}
        <FormCertificado />
      </section>
    </main>
  );
}
