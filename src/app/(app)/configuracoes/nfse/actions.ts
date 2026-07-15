"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { cifrarDominio } from "@/lib/cripto/envelope";
import { carregarCertificado } from "@/lib/nfse/certificado";

export type EstadoConfig = { erro?: string; ok?: boolean };

async function exigirAdmin() {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || perfil.papel !== "admin") return null;
  return perfil;
}

export async function salvarConfig(_prev: EstadoConfig, formData: FormData): Promise<EstadoConfig> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_config").upsert({
    id: 1,
    cnpj: String(formData.get("cnpj") ?? "").replace(/\D/g, ""),
    inscricao_municipal: String(formData.get("im") ?? "").trim(),
    razao_social: String(formData.get("razao_social") ?? "").trim(),
    codigo_municipio: String(formData.get("codigo_municipio") ?? "").trim(),
    uf: String(formData.get("uf") ?? "").trim(),
    codigo_servico_nacional: String(formData.get("codigo_servico_nacional") ?? "").replace(/\D/g, ""),
    descricao_servico: String(formData.get("descricao_servico") ?? "").trim(),
    aliquota_iss: Number(formData.get("aliquota_iss") ?? 0),
    pct_trib_sn: Number(formData.get("pct_trib_sn") ?? 0),
    simples_nacional: formData.get("simples") === "on",
    ambiente: String(formData.get("ambiente") ?? "homologacao"),
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { erro: "Falha ao salvar a configuração." };
  revalidatePath("/configuracoes/nfse");
  return { ok: true };
}

export async function salvarCertificado(_prev: EstadoConfig, formData: FormData): Promise<EstadoConfig> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("pfx") as File | null;
  const senha = String(formData.get("senha") ?? "");
  if (!arquivo || arquivo.size === 0 || !senha) return { erro: "Envie o .pfx e a senha." };
  const pfx = Buffer.from(await arquivo.arrayBuffer());
  let validade: Date;
  try {
    validade = carregarCertificado(pfx, senha).validade; // valida senha + extrai validade
  } catch {
    return { erro: "Certificado ou senha inválidos." };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("nfse_certificado").upsert({
    id: 1,
    nome_arquivo: arquivo.name,
    pfx_cifrado: await cifrarDominio("nfse", pfx),
    senha_cifrada: await cifrarDominio("nfse", Buffer.from(senha, "utf8")),
    validade: validade.toISOString(),
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { erro: "Falha ao salvar o certificado." };
  revalidatePath("/configuracoes/nfse");
  return { ok: true };
}
