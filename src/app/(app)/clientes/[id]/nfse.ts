"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { required } from "@/lib/env";
import { decifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps } from "@/lib/nfse/envio";
import { baixarDanfsePdf } from "@/lib/nfse/danfse";
import type { ConfigFiscal, Tomador, ResultadoCliente } from "@/lib/nfse/tipos";

export type EstadoNfse = { erro?: string; ok?: boolean };

// Retorna o XML autorizado (ou a DPS, se ainda não houver) para download.
export async function baixarXmlNfse(nfseId: string): Promise<{ erro?: string; conteudo?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("nfse").select("nfse_xml, dps_xml").eq("id", nfseId).maybeSingle();
  if (!data) return { erro: "Nota não encontrada." };
  const conteudo = data.nfse_xml ?? data.dps_xml;
  if (!conteudo) return { erro: "XML indisponível." };
  return { conteudo };
}

// Baixa o DANFSe (PDF) da Sefin (ADN) usando a chave + o certificado (mTLS).
export async function baixarDanfseNfse(nfseId: string): Promise<{ erro?: string; pdfBase64?: string; chave?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: nota } = await supabase
    .from("nfse")
    .select("chave_acesso, ambiente")
    .eq("id", nfseId)
    .maybeSingle();
  if (!nota?.chave_acesso) return { erro: "Nota sem chave de acesso." };
  // A nota já foi confirmada acessível ao usuário; o certificado é admin-RLS,
  // então carregamos via service_role apenas para o mTLS.
  const admin = createAdminSupabase();
  const { data: certRow } = await admin
    .from("nfse_certificado")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id", 1)
    .maybeSingle();
  if (!certRow) return { erro: "Certificado não cadastrado." };
  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }
  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  const pdf = await baixarDanfsePdf(nota.chave_acesso, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  if (!pdf) return { erro: "DANFSe indisponível no momento.", chave: nota.chave_acesso };
  return { pdfBase64: pdf.toString("base64") };
}

// Emite a NFS-e de um cliente numa competência. Retorno estruturado, usado tanto
// pela ficha (via emitirNfse) quanto pela emissão em lote.
export async function emitirNfseCliente(clienteId: string, competencia: string): Promise<ResultadoCliente> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return { status: "erro", motivo: "Sem permissão." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { status: "erro", motivo: "Competência inválida." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("nfse_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.cnpj || !cfg.codigo_servico_nacional) return { status: "erro", motivo: "Config fiscal ausente." };
  const { data: certRow } = await supabase.from("nfse_certificado").select("*").eq("id", 1).maybeSingle();
  if (!certRow) return { status: "erro", motivo: "Certificado não cadastrado." };

  const { data: cliente, error: cliErr } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, email, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (cliErr) return { status: "erro", motivo: "Falha ao carregar o cliente." };
  if (!cliente) return { status: "erro", motivo: "Cliente não encontrado." };
  const documento = String(cliente.cpf_cnpj ?? "").replace(/\D/g, "");
  if (!documento) return { status: "pulada", motivo: "Sem CNPJ/CPF." };

  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = Number(fin?.honorario_mensal ?? 0);
  if (!honorario || honorario <= 0) return { status: "pulada", motivo: "Sem honorário." };

  const ambiente: "homologacao" | "producao" = cfg.ambiente === "producao" ? "producao" : "homologacao";
  const { data: existente } = await supabase
    .from("nfse")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .eq("ambiente", ambiente)
    .maybeSingle();
  if (existente) return { status: "pulada", motivo: "Já emitida nesta competência." };

  const chaveKey = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  let cert;
  try {
    const pfx = decifrar(certRow.pfx_cifrado, chaveKey);
    const senha = decifrar(certRow.senha_cifrada, chaveKey).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { status: "erro", motivo: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { status: "erro", motivo: "Certificado expirado." };

  const config: ConfigFiscal = {
    cnpj: cfg.cnpj,
    inscricaoMunicipal: cfg.inscricao_municipal,
    razaoSocial: cfg.razao_social,
    codigoMunicipio: cfg.codigo_municipio,
    uf: cfg.uf,
    codigoServicoNacional: cfg.codigo_servico_nacional,
    descricaoServico: cfg.descricao_servico ?? "Honorarios",
    aliquotaIss: Number(cfg.aliquota_iss),
    pctTribSN: Number(cfg.pct_trib_sn ?? 0),
    simplesNacional: cfg.simples_nacional,
    ambiente,
  };
  const tomador: Tomador = {
    documento,
    razaoSocial: cliente.razao_social,
    email: cliente.email ?? undefined,
    endereco: (cliente.endereco as Record<string, string> | null) ?? undefined,
  };

  const { count } = await supabase.from("nfse").select("id", { count: "exact", head: true });
  const numeroDps = String((count ?? 0) + 1);
  const { xml, idDps } = montarDps({ config, tomador, valor: honorario, competencia, serie: "1", numeroDps });
  const assinado = assinarDps(xml, idDps, cert);

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  } catch (e) {
    console.error("emitirNfseCliente:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({
      cliente_id: clienteId,
      valor: honorario,
      competencia,
      status: "erro",
      dps_xml: assinado,
      ambiente,
      mensagens: [{ descricao: "Falha de comunicação" }],
    });
    return { status: "erro", motivo: "Falha de comunicação com a Sefin." };
  }

  await supabase.from("nfse").insert({
    cliente_id: clienteId,
    valor: honorario,
    competencia,
    status: resultado.autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado.chaveAcesso ?? null,
    numero: resultado.numero ?? null,
    dps_xml: assinado,
    nfse_xml: resultado.xmlNfse ?? null,
    mensagens: resultado.mensagens ? resultado.mensagens.map((m) => ({ descricao: m })) : null,
    ambiente,
    autorizada_em: resultado.autorizada ? new Date().toISOString() : null,
  });
  return resultado.autorizada
    ? { status: "autorizada", chave: resultado.chaveAcesso, numero: resultado.numero }
    : { status: "rejeitada", motivo: resultado.mensagens?.join("; ") };
}

export async function emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse> {
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };
  const r = await emitirNfseCliente(clienteId, competencia);
  revalidatePath(`/clientes/${clienteId}`);
  if (r.status === "autorizada") return { ok: true };
  return { erro: r.motivo ?? "Não foi possível emitir." };
}
