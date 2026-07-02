"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { required } from "@/lib/env";
import { decifrar } from "@/lib/nfse/cripto";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import { enviarDps } from "@/lib/nfse/envio";
import type { ConfigFiscal, Tomador } from "@/lib/nfse/tipos";

export type EstadoNfse = { erro?: string; ok?: boolean };

export async function emitirNfse(clienteId: string, _prev: EstadoNfse, formData: FormData): Promise<EstadoNfse> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada." };
  if (!podeVerHonorario(perfil.papel)) return { erro: "Sem permissão para emitir NFS-e." };
  const competencia = String(formData.get("competencia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Informe a competência." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("nfse_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.cnpj || !cfg.codigo_servico_nacional)
    return { erro: "Configure os dados fiscais em Configurações → NFS-e." };
  const { data: certRow } = await supabase.from("nfse_certificado").select("*").eq("id", 1).maybeSingle();
  if (!certRow) return { erro: "Cadastre o certificado A1 em Configurações → NFS-e." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social, cnpj, cpf, email, endereco")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado." };
  const documento = String(cliente.cnpj ?? cliente.cpf ?? "").replace(/\D/g, "");
  if (!documento) return { erro: "Cliente sem CNPJ/CPF — necessário para a NFS-e." };
  // Honorário fica em clientes_financeiro (RLS = admin/financeiro/contador-dono).
  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = Number(fin?.honorario_mensal ?? 0);
  if (!honorario || honorario <= 0) return { erro: "Cliente sem honorário definido." };

  // Anti-duplicidade: já há nota autorizada nesta competência?
  const { data: existente } = await supabase
    .from("nfse")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("competencia", competencia)
    .eq("status", "autorizada")
    .maybeSingle();
  if (existente) return { erro: "Já existe NFS-e autorizada para este cliente nesta competência." };

  const chave = required(process.env.NFSE_CERT_KEY, "NFSE_CERT_KEY");
  const pfx = decifrar(certRow.pfx_cifrado, chave);
  const senha = decifrar(certRow.senha_cifrada, chave).toString("utf8");
  let cert;
  try {
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado." };
  }
  if (cert.validade.getTime() < Date.now()) return { erro: "Certificado expirado." };

  const ambiente: "homologacao" | "producao" = cfg.ambiente === "producao" ? "producao" : "homologacao";
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

  // Número da DPS: sequencial simples por contagem (a Sefin controla o número final da NFS-e).
  const { count } = await supabase.from("nfse").select("id", { count: "exact", head: true });
  const numeroDps = String((count ?? 0) + 1);

  const { xml, idDps } = montarDps({ config, tomador, valor: honorario, competencia, serie: "1", numeroDps });
  const assinado = assinarDps(xml, idDps, cert);

  let resultado;
  try {
    resultado = await enviarDps(assinado, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  } catch (e) {
    console.error("emitirNfse:", e instanceof Error ? e.message : e);
    await supabase.from("nfse").insert({
      cliente_id: clienteId,
      valor: honorario,
      competencia,
      status: "erro",
      dps_xml: assinado,
      ambiente,
      mensagens: [{ descricao: "Falha de comunicação" }],
    });
    revalidatePath(`/clientes/${clienteId}`);
    return { erro: "Falha ao comunicar com a Sefin. Registrada como erro." };
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
  revalidatePath(`/clientes/${clienteId}`);
  return resultado.autorizada ? { ok: true } : { erro: `Rejeitada: ${resultado.mensagens?.join("; ")}` };
}
